import type { CourtResolution, CourtSession } from '../../../../shared/contracts/court'
import type { NationalAgendaWindow } from '../../../../shared/contracts/commBus'
import type { CivilMemoryEntry, CivilMemoryEventType } from '../../../../shared/contracts/civilMemory'
import { appendCivilMemoryEntry, queryCivilMemory } from './CivilMemoryStore'

function unique(values: string[]): string[] {
  return Array.from(new Set(values.filter((item) => item.trim().length > 0)))
}

export function recordAgendaWindowMemory(window: NationalAgendaWindow): CivilMemoryEntry {
  return appendCivilMemoryEntry({
    tick: window.tick,
    type: 'agenda_compiled',
    title: `Agenda compiled T${window.tick}`,
    summary: window.summary,
    relatedIds: [window.id, ...window.options.map((item) => item.id)].slice(0, 60),
    factionIds: unique(window.options.flatMap((item) => item.sourceFactionIds)),
    responsibilities: [],
    metadata: {
      optionCountIn: window.optionCountIn,
      optionCountOut: window.optionCountOut,
      optionKeys: window.options.map((item) => item.intentKey),
    },
  })
}

export function recordCourtSessionMemory(session: CourtSession): CivilMemoryEntry[] {
  const seatWeightById = new Map(session.seats.map((seat) => [seat.id, seat.weight]))

  const records: CivilMemoryEntry[] = []
  records.push(
    appendCivilMemoryEntry({
      tick: session.tick,
      type: 'court_session_closed',
      title: `Court session closed T${session.tick}`,
      summary: session.summary,
      relatedIds: [session.id, ...session.resolutions.map((item) => item.id)].slice(0, 60),
      factionIds: unique(session.seats.map((seat) => seat.factionId)),
      sessionId: session.id,
      responsibilities: [],
      metadata: {
        seats: session.seats.length,
        proposals: session.proposals.length,
        passed: session.resolutions.filter((item) => item.decision === 'passed').length,
        rejected: session.resolutions.filter((item) => item.decision === 'rejected').length,
        deferred: session.resolutions.filter((item) => item.decision === 'deferred').length,
      },
    }),
  )

  for (const resolution of session.resolutions) {
    const proposal = session.proposals.find((item) => item.id === resolution.proposalId)
    const responsibilities = resolution.accountableSeatIds.map((seatId) => ({
      seatId,
      role: 'voter_yes' as const,
      weight: seatWeightById.get(seatId) ?? 0,
    }))

    records.push(
      appendCivilMemoryEntry({
        tick: session.tick,
        type: 'court_resolution',
        title: `Resolution ${resolution.decision} - ${proposal?.sourceIntentKey ?? resolution.proposalId}`,
        summary: resolution.executionDirective,
        relatedIds: [session.id, resolution.id, resolution.proposalId],
        factionIds: unique(proposal?.sourceFactionIds ?? []),
        sessionId: session.id,
        proposalId: resolution.proposalId,
        resolutionId: resolution.id,
        outcome: resolution.decision === 'passed' ? 'pending' : 'failed',
        responsibilities,
        metadata: {
          decision: resolution.decision,
          yesWeight: resolution.yesWeight,
          noWeight: resolution.noWeight,
          abstainWeight: resolution.abstainWeight,
          thresholdRatio: resolution.thresholdRatio,
          passedRatio: resolution.passedRatio,
        },
      }),
    )
  }

  return records
}

export function recordExecutionOutcomeMemory(params: {
  tick: number
  worldVersion: number
  narrativeCount: number
  memoryWrites: number
  memoryWriteFailures: number
  passedResolutions: CourtResolution[]
}): CivilMemoryEntry {
  const outcome = params.memoryWriteFailures > 0 ? 'failed' : 'success'

  return appendCivilMemoryEntry({
    tick: params.tick,
    type: 'execution_outcome',
    title: `Execution outcome T${params.tick}`,
    summary: `narratives=${params.narrativeCount}, memoryWrites=${params.memoryWrites}, failures=${params.memoryWriteFailures}`,
    relatedIds: params.passedResolutions.map((item) => item.id),
    factionIds: [],
    outcome,
    responsibilities: params.passedResolutions.flatMap((resolution) =>
      resolution.accountableSeatIds.map((seatId) => ({ seatId, role: 'executor' as const, weight: 1 })),
    ),
    metadata: {
      worldVersion: params.worldVersion,
      narrativeCount: params.narrativeCount,
      memoryWrites: params.memoryWrites,
      memoryWriteFailures: params.memoryWriteFailures,
      passedResolutionIds: params.passedResolutions.map((item) => item.id),
    },
  })
}

export function getCivilMemoryEntries(params: {
  limit?: number
  type?: CivilMemoryEventType
  tickFrom?: number
  tickTo?: number
} = {}): CivilMemoryEntry[] {
  return queryCivilMemory(params)
}
