import { randomUUID } from 'node:crypto'
import type { WorldState } from '../../../../shared/contracts/game'
import type { CourtProposal, CourtResolution, CourtSession, CourtSeat, CourtVote } from '../../../../shared/contracts/court'
import type { NationalAgendaOption, NationalAgendaWindow } from '../../../../shared/contracts/commBus'
import { courtSessionSchema } from '../../../../shared/schemas/court'
import { recordCourtSession, getLatestCourtSession, getCourtSessions } from './CourtStore'

const DEADLOCK_MAX_DEFERRED_STREAK = Number.isFinite(Number(process.env.COURT_DEADLOCK_MAX_DEFERRED_STREAK))
  ? Math.max(1, Math.min(12, Math.floor(Number(process.env.COURT_DEADLOCK_MAX_DEFERRED_STREAK))))
  : 3

function priorityWeight(priority: NationalAgendaOption['priority']): number {
  if (priority === 'P0') return 3
  if (priority === 'P1') return 2
  return 1
}

function proposalClassOf(option: NationalAgendaOption): CourtProposal['proposalClass'] {
  if (option.priority === 'P0') return 'war'
  if (option.sourceDomainIds.length >= 4) return 'constitutional'
  return 'routine'
}

function thresholdRatioByClass(value: CourtProposal['proposalClass']): number {
  if (value === 'war') return 0.6
  if (value === 'constitutional') return 0.67
  return 0.5
}

function buildSeats(world: WorldState): CourtSeat[] {
  const tick = world.tick
  const factionIds = Object.keys(world.factions).sort()
  const seats: CourtSeat[] = []

  for (const factionId of factionIds) {
    seats.push({
      id: `seat_human_${factionId}`,
      tick,
      factionId,
      holderType: 'human',
      role: 'human_lord',
      holderId: `human_${factionId}`,
      holderName: `${factionId} Human Seat`,
      weight: 1.25,
      canVeto: true,
    })

    seats.push({
      id: `seat_ai_${factionId}`,
      tick,
      factionId,
      holderType: 'ai',
      role: 'ai_council',
      holderId: `ai_${factionId}`,
      holderName: `${factionId} AI Council Seat`,
      weight: 1,
      canVeto: false,
    })
  }

  return seats
}

function buildProposals(tick: number, agenda: NationalAgendaWindow, maxProposals: number): CourtProposal[] {
  const normalizedMax = Number.isFinite(maxProposals) ? Math.max(1, Math.min(9, Math.floor(maxProposals))) : 9
  return agenda.options.slice(0, normalizedMax).map((option, index) => ({
    id: `court_proposal_${tick}_${index + 1}_${option.intentKey}`,
    tick,
    sourceOptionId: option.id,
    sourceIntentKey: option.intentKey,
    priority: option.priority,
    proposalClass: proposalClassOf(option),
    title: option.title,
    summary: option.summary,
    recommendedAction: option.recommendedAction,
    sourceDomainIds: [...option.sourceDomainIds],
    sourceFactionIds: [...option.sourceFactionIds],
  }))
}

function buildSessionSummary(tick: number, resolutions: CourtResolution[]): string {
  const passed = resolutions.filter((item) => item.decision === 'passed').length
  const rejected = resolutions.filter((item) => item.decision === 'rejected').length
  const deferred = resolutions.filter((item) => item.decision === 'deferred').length
  return `Court session T${tick}: passed=${passed}, rejected=${rejected}, deferred=${deferred}.`
}

function decideVote(seat: CourtSeat, proposal: CourtProposal, proposalIndex: number): CourtVote {
  let score = priorityWeight(proposal.priority)

  if (proposal.sourceFactionIds.includes(seat.factionId)) score += 2
  if (seat.holderType === 'human') score += 0.6
  if (seat.role === 'ai_council' && proposal.recommendedAction === 'recon_first') score += 0.5
  if (proposal.recommendedAction === 'diplomacy' && seat.holderType === 'human') score -= 0.4
  if (proposalIndex >= 6) score -= 0.3

  let choice: CourtVote['choice'] = 'abstain'
  let reason = 'quorum_control'

  if (score >= 4.2) {
    choice = 'yes'
    reason = 'strategic_alignment'
  } else if (score >= 2.6) {
    choice = seat.holderType === 'human' ? 'yes' : 'abstain'
    reason = choice === 'yes' ? 'risk_accepted' : 'insufficient_certainty'
  } else if (score <= 1.4) {
    choice = 'no'
    reason = 'insufficient_support'
  }

  return {
    seatId: seat.id,
    proposalId: proposal.id,
    choice,
    reason,
  }
}

function countConsecutiveDeferredByIntent(intentKey: string, sessions: CourtSession[]): number {
  let streak = 0

  for (const session of sessions) {
    const proposal = session.proposals.find((item) => item.sourceIntentKey === intentKey)
    if (!proposal) continue
    const resolution = session.resolutions.find((item) => item.proposalId === proposal.id)
    if (!resolution) continue
    if (resolution.decision !== 'deferred') break
    streak += 1
  }

  return streak
}

function applyDeadlockGuard(session: CourtSession, history: CourtSession[]): CourtSession {
  if (session.resolutions.length === 0) return session

  let changed = false
  const guardedResolutions: CourtResolution[] = session.resolutions.map((resolution) => {
    if (resolution.decision !== 'deferred') return resolution
    const proposal = session.proposals.find((item) => item.id === resolution.proposalId)
    if (!proposal) return resolution

    const deferredStreak = countConsecutiveDeferredByIntent(proposal.sourceIntentKey, history) + 1
    if (deferredStreak < DEADLOCK_MAX_DEFERRED_STREAK) return resolution

    changed = true
    return {
      ...resolution,
      decision: 'rejected' as const,
      executionDirective: `expire:${proposal.sourceIntentKey}:deferred_timeout`,
      accountableSeatIds: [] as string[],
    }
  })

  if (!changed) return session

  return courtSessionSchema.parse({
    ...session,
    resolutions: guardedResolutions,
    summary: buildSessionSummary(session.tick, guardedResolutions),
  })
}

export function auditCourtSessionIdentity(session: CourtSession): { ok: boolean; errors: string[] } {
  const errors: string[] = []
  const seatById = new Map(session.seats.map((item) => [item.id, item]))
  const proposalById = new Map(session.proposals.map((item) => [item.id, item]))
  const seen = new Set<string>()

  for (const vote of session.votes) {
    const seat = seatById.get(vote.seatId)
    if (!seat) {
      errors.push(`unknown seat on vote: ${vote.seatId}`)
      continue
    }
    if (!proposalById.has(vote.proposalId)) {
      errors.push(`unknown proposal on vote: ${vote.proposalId}`)
      continue
    }

    const identityPrefix = seat.holderType === 'human' ? 'seat_human_' : 'seat_ai_'
    if (!vote.seatId.startsWith(identityPrefix)) {
      errors.push(`seat identity mismatch: ${vote.seatId} expected ${identityPrefix}`)
    }

    const pairKey = `${vote.seatId}|${vote.proposalId}`
    if (seen.has(pairKey)) {
      errors.push(`duplicate vote pair: ${pairKey}`)
      continue
    }
    seen.add(pairKey)
  }

  for (const proposal of session.proposals) {
    const count = session.votes.filter((item) => item.proposalId === proposal.id).length
    if (count !== session.seats.length) {
      errors.push(`proposal vote cardinality mismatch: ${proposal.id} expected=${session.seats.length} actual=${count}`)
    }
  }

  return { ok: errors.length === 0, errors }
}

function resolveProposal(params: {
  proposal: CourtProposal
  seats: CourtSeat[]
  votes: CourtVote[]
}): CourtResolution {
  const yesWeight = params.votes
    .filter((item) => item.choice === 'yes')
    .reduce((sum, item) => sum + (params.seats.find((seat) => seat.id === item.seatId)?.weight ?? 0), 0)

  const noWeight = params.votes
    .filter((item) => item.choice === 'no')
    .reduce((sum, item) => sum + (params.seats.find((seat) => seat.id === item.seatId)?.weight ?? 0), 0)

  const abstainWeight = params.votes
    .filter((item) => item.choice === 'abstain')
    .reduce((sum, item) => sum + (params.seats.find((seat) => seat.id === item.seatId)?.weight ?? 0), 0)

  const totalWeight = params.seats.reduce((sum, seat) => sum + seat.weight, 0)
  const participatingWeight = yesWeight + noWeight
  const quorumMet = participatingWeight >= totalWeight * 0.6
  const thresholdRatio = thresholdRatioByClass(params.proposal.proposalClass)
  const passedRatio = participatingWeight > 0 ? yesWeight / participatingWeight : 0

  let decision: CourtResolution['decision'] = 'rejected'
  if (!quorumMet) {
    decision = 'deferred'
  } else if (yesWeight > noWeight && passedRatio >= thresholdRatio) {
    decision = 'passed'
  }

  const accountableSeatIds = params.votes.filter((item) => item.choice === 'yes').map((item) => item.seatId)

  return {
    id: `court_resolution_${params.proposal.id}`,
    proposalId: params.proposal.id,
    decision,
    quorumMet,
    yesWeight: Number(yesWeight.toFixed(2)),
    noWeight: Number(noWeight.toFixed(2)),
    abstainWeight: Number(abstainWeight.toFixed(2)),
    thresholdRatio,
    passedRatio: Number(passedRatio.toFixed(4)),
    executionDirective:
      decision === 'passed'
        ? `execute:${params.proposal.sourceIntentKey}:${params.proposal.recommendedAction}`
        : `hold:${params.proposal.sourceIntentKey}`,
    accountableSeatIds,
  }
}

export function simulateCourtSession(params: {
  world: WorldState
  nationalAgenda: NationalAgendaWindow
  maxProposals?: number
}): CourtSession {
  const tick = params.world.tick
  const seats = buildSeats(params.world)
  const proposals = buildProposals(tick, params.nationalAgenda, params.maxProposals ?? 9)
  const optionById = new Map(params.nationalAgenda.options.map((item) => [item.id, item]))

  const votes: CourtVote[] = []
  for (const [proposalIndex, proposal] of proposals.entries()) {
    const sourceOption = optionById.get(proposal.sourceOptionId)
    if (!sourceOption) continue
    for (const seat of seats) {
      votes.push(decideVote(seat, proposal, proposalIndex))
    }
  }

  const resolutions = proposals.map((proposal) =>
    resolveProposal({
      proposal,
      seats,
      votes: votes.filter((item) => item.proposalId === proposal.id),
    }),
  )

  const now = new Date().toISOString()
  const session: CourtSession = {
    id: `court_session_${tick}_${randomUUID().slice(0, 8)}`,
    tick,
    agendaId: params.nationalAgenda.id,
    seats,
    proposals,
    votes,
    resolutions,
    summary: buildSessionSummary(tick, resolutions),
    openedAt: now,
    closedAt: now,
  }

  return courtSessionSchema.parse(session)
}

export function runCourtSession(params: {
  world: WorldState
  nationalAgenda: NationalAgendaWindow
  maxProposals?: number
}): CourtSession {
  const simulated = simulateCourtSession(params)
  const history = getCourtSessions(DEADLOCK_MAX_DEFERRED_STREAK + 6)
  const session = applyDeadlockGuard(simulated, history)

  const audit = auditCourtSessionIdentity(session)
  if (!audit.ok) {
    throw new Error(`court identity gate failed: ${audit.errors.slice(0, 4).join('; ')}`)
  }

  recordCourtSession(session)
  return session
}

export { getLatestCourtSession, getCourtSessions }
