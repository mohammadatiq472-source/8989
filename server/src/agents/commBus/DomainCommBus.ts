import { randomUUID } from 'node:crypto'
import type { AIPlayer, Unit, WorldState } from '../../../../shared/contracts/game'
import { resolveFactionAiQuotaLimit } from '../../../../shared/domain/aiQuota'
import type {
  BusMessage,
  CommPriority,
  CommTopic,
  DomainAgenda,
  DomainAgendaCandidate,
  DomainAgendaOption,
  DomainCommDropReason,
  DomainCommMetricsSnapshot,
  DomainCommPreviewResponse,
  DomainCommWindowSummary,
} from '../../../../shared/contracts/commBus'
import { busMessageSchema, domainAgendaSchema } from '../../../../shared/schemas/commBus'

type DomainActor = {
  aiPlayerId: string
  name: string
  specialty: AIPlayer['specialty']
  unitIds: string[]
}

type DomainRuntimeState = {
  lastAgenda?: DomainAgenda
  lastMetrics?: DomainCommMetricsSnapshot
}

type RoutedMessage = {
  message: BusMessage
  receiverIds: string[]
}

const domainStates = new Map<string, DomainRuntimeState>()

const SEND_QUOTA_PER_AI = 3
const RECEIVE_QUOTA_PER_AI = 12
const MAX_AGENDA_CANDIDATES = 5
const DEFAULT_TTL_TICKS = 2

const EMPTY_DROP_REASONS: Record<DomainCommDropReason, number> = {
  send_quota: 0,
  receive_quota: 0,
  dedupe: 0,
  invalid_receiver: 0,
}

function priorityWeight(priority: CommPriority): number {
  if (priority === 'P0') return 3
  if (priority === 'P1') return 2
  return 1
}

function specialtyFromUnit(unit: Unit): AIPlayer['specialty'] {
  const arch = unit.hero.archetype
  if (arch === 'recon' || arch === 'mobile') return 'recon'
  if (arch === 'guard') return 'guard'
  if (arch === 'logistics') return 'logistics'
  if (arch === 'assault' || arch === 'heavy') return 'assault'
  return 'expansion'
}

function normalizeDomainId(factionId: string): string {
  return `domain:${factionId}`
}

function inferDomainActors(world: WorldState, factionId: string): DomainActor[] {
  const faction = world.factions[factionId]
  if (!faction) return []
  const quotaLimit = resolveFactionAiQuotaLimit(world, factionId)

  if (faction.aiPlayers && faction.aiPlayers.length > 0) {
    return faction.aiPlayers.slice(0, quotaLimit).map((player) => ({
      aiPlayerId: player.id,
      name: player.name,
      specialty: player.specialty,
      unitIds: [...player.unitIds],
    }))
  }

  const factionUnits = world.units.filter((unit) => unit.faction === factionId)
  return factionUnits.slice(0, quotaLimit).map((unit, index) => ({
    aiPlayerId: unit.aiPlayerId ?? `derived_ai_${factionId}_${index + 1}`,
    name: unit.name,
    specialty: specialtyFromUnit(unit),
    unitIds: [unit.id],
  }))
}

function summarizeActorSituation(world: WorldState, actor: DomainActor) {
  const units = actor.unitIds
    .map((unitId) => world.units.find((candidate) => candidate.id === unitId))
    .filter((unit): unit is Unit => Boolean(unit))

  if (units.length === 0) {
    return {
      avgSupply: 0,
      avgStrength: 0,
      maxEnemyPressure: 0,
      primaryTileId: 'unknown',
      reconUnitCount: 0,
    }
  }

  const avgSupply = units.reduce((sum, unit) => sum + unit.supply, 0) / units.length
  const avgStrength = units.reduce((sum, unit) => sum + unit.strength, 0) / units.length
  let maxEnemyPressure = 0
  let primaryTileId = units[0].tileId

  for (const unit of units) {
    const tile = world.map.tiles.find((candidate) => candidate.id === unit.tileId)
    const pressure = tile?.enemyPressure ?? 0
    if (pressure > maxEnemyPressure) {
      maxEnemyPressure = pressure
      primaryTileId = unit.tileId
    }
  }

  const reconUnitCount = units.filter((unit) => unit.status === '\u4fa6\u5bdf\u4e2d').length

  return {
    avgSupply,
    avgStrength,
    maxEnemyPressure,
    primaryTileId,
    reconUnitCount,
  }
}

function makeMessage(params: {
  tick: number
  domainId: string
  factionId: string
  senderAiPlayerId: string
  receiverAiPlayerIds: string[]
  topic: CommTopic
  priority: CommPriority
  intent: string
  payload: Record<string, unknown>
  evidenceRefs: string[]
  conflictKey?: string
  dedupeKey?: string
}): BusMessage {
  const message: BusMessage = {
    id: randomUUID(),
    tick: params.tick,
    domainId: params.domainId,
    factionId: params.factionId,
    senderAiPlayerId: params.senderAiPlayerId,
    receiverAiPlayerIds: params.receiverAiPlayerIds,
    topic: params.topic,
    priority: params.priority,
    ttlTicks: DEFAULT_TTL_TICKS,
    confidence: params.priority === 'P0' ? 0.9 : params.priority === 'P1' ? 0.75 : 0.6,
    intent: params.intent,
    payload: params.payload,
    evidenceRefs: params.evidenceRefs,
    conflictKey: params.conflictKey,
    dedupeKey: params.dedupeKey,
    createdAt: Date.now(),
  }

  return busMessageSchema.parse(message)
}

function buildActorMessages(world: WorldState, domainId: string, factionId: string, actor: DomainActor): {
  messages: BusMessage[]
  candidate: DomainAgendaCandidate
} {
  const situation = summarizeActorSituation(world, actor)
  const messages: BusMessage[] = []
  const evidence = [`tile:${situation.primaryTileId}`]

  if (situation.maxEnemyPressure >= 70) {
    messages.push(
      makeMessage({
        tick: world.tick,
        domainId,
        factionId,
        senderAiPlayerId: actor.aiPlayerId,
        receiverAiPlayerIds: ['domain_all'],
        topic: 'support_request',
        priority: 'P0',
        intent: 'reinforce_hotspot',
        payload: {
          targetTileId: situation.primaryTileId,
          enemyPressure: Math.round(situation.maxEnemyPressure),
          requestedSupport: 'combat_unit',
        },
        evidenceRefs: evidence,
        conflictKey: `hotspot:${situation.primaryTileId}`,
        dedupeKey: `support:${actor.aiPlayerId}:${situation.primaryTileId}`,
      }),
    )
  }

  if (situation.avgSupply <= 3.5) {
    messages.push(
      makeMessage({
        tick: world.tick,
        domainId,
        factionId,
        senderAiPlayerId: actor.aiPlayerId,
        receiverAiPlayerIds: ['domain_all'],
        topic: 'resource_alert',
        priority: 'P1',
        intent: 'stabilize_supply',
        payload: {
          targetTileId: situation.primaryTileId,
          avgSupply: Number(situation.avgSupply.toFixed(2)),
        },
        evidenceRefs: evidence,
        conflictKey: `supply:${factionId}`,
        dedupeKey: `supply:${actor.aiPlayerId}`,
      }),
    )
  }

  if (situation.reconUnitCount > 0) {
    messages.push(
      makeMessage({
        tick: world.tick,
        domainId,
        factionId,
        senderAiPlayerId: actor.aiPlayerId,
        receiverAiPlayerIds: ['domain_all'],
        topic: 'intel_report',
        priority: 'P1',
        intent: 'share_recon_snapshot',
        payload: {
          reconUnits: situation.reconUnitCount,
          focusTileId: situation.primaryTileId,
        },
        evidenceRefs: evidence,
        dedupeKey: `intel:${actor.aiPlayerId}:${world.tick}`,
      }),
    )
  }

  if (messages.length === 0) {
    messages.push(
      makeMessage({
        tick: world.tick,
        domainId,
        factionId,
        senderAiPlayerId: actor.aiPlayerId,
        receiverAiPlayerIds: ['domain_all'],
        topic: 'status_update',
        priority: 'P2',
        intent: 'hold_position',
        payload: {
          tileId: situation.primaryTileId,
          avgStrength: Number(situation.avgStrength.toFixed(2)),
        },
        evidenceRefs: evidence,
        dedupeKey: `status:${actor.aiPlayerId}:${world.tick}`,
      }),
    )
  }

  const top = [...messages].sort((left, right) => priorityWeight(right.priority) - priorityWeight(left.priority))[0]

  const candidate: DomainAgendaCandidate = {
    intent: top.intent,
    actionId: resolveAgendaActionIdFromIntent(top.intent),
    priority: top.priority,
    summary: `${actor.name} proposes ${top.intent} at ${situation.primaryTileId}`,
    supportingAiPlayerIds: [actor.aiPlayerId],
    evidenceRefs: top.evidenceRefs,
    targetTileId: situation.primaryTileId,
    targetUnitIds: [...actor.unitIds],
  }

  return { messages, candidate }
}

function compileAgenda(
  world: WorldState,
  domainId: string,
  factionId: string,
  candidates: DomainAgendaCandidate[],
): DomainAgenda {
  const merged = new Map<string, DomainAgendaCandidate>()

  for (const candidate of candidates) {
    const existing = merged.get(candidate.intent)
    if (!existing) {
      merged.set(candidate.intent, {
        ...candidate,
        supportingAiPlayerIds: [...candidate.supportingAiPlayerIds],
        evidenceRefs: [...candidate.evidenceRefs],
        targetUnitIds: candidate.targetUnitIds ? [...candidate.targetUnitIds] : undefined,
      })
      continue
    }

    const aiSet = new Set([...existing.supportingAiPlayerIds, ...candidate.supportingAiPlayerIds])
    const evidenceSet = new Set([...existing.evidenceRefs, ...candidate.evidenceRefs])
    const higherPriority = priorityWeight(candidate.priority) > priorityWeight(existing.priority) ? candidate.priority : existing.priority

    merged.set(candidate.intent, {
      intent: candidate.intent,
      actionId: existing.actionId,
      priority: higherPriority,
      summary: existing.summary,
      supportingAiPlayerIds: [...aiSet],
      evidenceRefs: [...evidenceSet],
      targetTileId: existing.targetTileId ?? candidate.targetTileId,
      targetUnitIds: existing.targetUnitIds ?? candidate.targetUnitIds,
    })
  }

  const topCandidates = [...merged.values()]
    .sort((left, right) => {
      const byPriority = priorityWeight(right.priority) - priorityWeight(left.priority)
      if (byPriority !== 0) return byPriority
      return right.supportingAiPlayerIds.length - left.supportingAiPlayerIds.length
    })
    .slice(0, MAX_AGENDA_CANDIDATES)
  const options = topCandidates.map((candidate) => buildAgendaOption(candidate))

  const agenda: DomainAgenda = {
    id: `domain_agenda_${factionId}_${world.tick}`,
    tick: world.tick,
    generatedWorldVersion: world.worldVersion,
    domainId,
    factionId,
    candidates: topCandidates,
    options,
    targetTileId: topCandidates[0]?.targetTileId,
    targetUnitIds: topCandidates[0]?.targetUnitIds ? [...topCandidates[0].targetUnitIds] : undefined,
    recommendedFollowups: buildAgendaRecommendedFollowups(topCandidates[0]?.actionId ?? ''),
    summary:
      topCandidates.length > 0
        ? `Domain ${factionId} agenda: ${topCandidates.map((candidate) => candidate.intent).join(', ')}`
        : `Domain ${factionId} agenda: no actionable candidates`,
    generatedAt: Date.now(),
  }

  return domainAgendaSchema.parse(agenda)
}

function buildAgendaOption(candidate: DomainAgendaCandidate): DomainAgendaOption {
  return {
    actionId: candidate.actionId,
    intent: candidate.intent,
    label: resolveAgendaActionLabel(candidate.actionId),
    summary: candidate.summary,
    priority: candidate.priority,
    targetTileId: candidate.targetTileId,
    targetUnitIds: candidate.targetUnitIds ? [...candidate.targetUnitIds] : undefined,
    supportingAiPlayerIds: [...candidate.supportingAiPlayerIds],
    evidenceRefs: [...candidate.evidenceRefs],
    supportCount: candidate.supportingAiPlayerIds.length,
    recommendedFollowups: buildAgendaRecommendedFollowups(candidate.actionId),
  }
}

function resolveAgendaActionIdFromIntent(intent: string): string {
  switch (intent.trim()) {
    case 'reinforce_hotspot':
      return 'agenda_support'
    case 'stabilize_supply':
      return 'agenda_recover'
    case 'share_recon_snapshot':
      return 'agenda_redeploy'
    case 'hold_position':
      return 'agenda_stabilize'
    default:
      return 'agenda_expand'
  }
}

function resolveAgendaActionLabel(actionId: string): string {
  switch (actionId) {
    case 'agenda_support':
      return '执行支援议程'
    case 'agenda_stabilize':
      return '执行稳态议程'
    case 'agenda_recover':
      return '执行整补议程'
    case 'agenda_redeploy':
      return '执行调动议程'
    default:
      return '执行扩张议程'
  }
}

function buildAgendaRecommendedFollowups(actionId: string): string[] {
  switch (actionId) {
    case 'agenda_support':
      return ['stabilize_supply', 'share_recon_snapshot']
    case 'agenda_stabilize':
      return ['stabilize_supply', 'hold_position']
    case 'agenda_recover':
      return ['stabilize_supply', 'share_recon_snapshot']
    case 'agenda_redeploy':
      return ['share_recon_snapshot', 'reinforce_hotspot']
    default:
      return ['reinforce_hotspot', 'share_recon_snapshot']
  }
}

function routeMessages(domainActors: DomainActor[], outbound: BusMessage[]): {
  routed: RoutedMessage[]
  droppedByReason: Record<DomainCommDropReason, number>
  deliveredCount: number
  conflictBuckets: number
} {
  const droppedByReason: Record<DomainCommDropReason, number> = { ...EMPTY_DROP_REASONS }
  const actorIds = new Set(domainActors.map((actor) => actor.aiPlayerId))
  const sendCountByActor = new Map<string, number>()
  const receiveCountByActor = new Map<string, number>()
  const dedupeSeen = new Set<string>()
  const conflictMap = new Map<string, Set<string>>()

  const sorted = [...outbound].sort((left, right) => priorityWeight(right.priority) - priorityWeight(left.priority))
  const routed: RoutedMessage[] = []
  let deliveredCount = 0

  for (const message of sorted) {
    const sent = sendCountByActor.get(message.senderAiPlayerId) ?? 0
    if (sent >= SEND_QUOTA_PER_AI) {
      droppedByReason.send_quota += 1
      continue
    }

    const dedupeKey = message.dedupeKey?.trim()
    if (dedupeKey && dedupeSeen.has(dedupeKey)) {
      droppedByReason.dedupe += 1
      continue
    }

    const receiverIds = message.receiverAiPlayerIds.includes('domain_all')
      ? domainActors.map((actor) => actor.aiPlayerId).filter((actorId) => actorId !== message.senderAiPlayerId)
      : message.receiverAiPlayerIds.filter((actorId) => actorIds.has(actorId) && actorId !== message.senderAiPlayerId)

    if (receiverIds.length === 0) {
      droppedByReason.invalid_receiver += 1
      continue
    }

    const acceptedReceivers: string[] = []
    for (const receiverId of receiverIds) {
      const consumed = receiveCountByActor.get(receiverId) ?? 0
      if (consumed >= RECEIVE_QUOTA_PER_AI) {
        droppedByReason.receive_quota += 1
        continue
      }
      receiveCountByActor.set(receiverId, consumed + 1)
      acceptedReceivers.push(receiverId)
      deliveredCount += 1
    }

    if (acceptedReceivers.length === 0) {
      continue
    }

    sendCountByActor.set(message.senderAiPlayerId, sent + 1)

    if (dedupeKey) dedupeSeen.add(dedupeKey)

    if (message.conflictKey) {
      const intents = conflictMap.get(message.conflictKey) ?? new Set<string>()
      intents.add(message.intent)
      conflictMap.set(message.conflictKey, intents)
    }

    routed.push({ message, receiverIds: acceptedReceivers })
  }

  const conflictBuckets = [...conflictMap.values()].filter((intents) => intents.size > 1).length

  return {
    routed,
    droppedByReason,
    deliveredCount,
    conflictBuckets,
  }
}

function buildPreviewForFaction(world: WorldState, factionId: string, includeMessages: boolean): DomainCommPreviewResponse | null {
  const actors = inferDomainActors(world, factionId)
  if (actors.length === 0) return null

  const domainId = normalizeDomainId(factionId)
  const allMessages: BusMessage[] = []
  const candidates: DomainAgendaCandidate[] = []

  for (const actor of actors) {
    const generated = buildActorMessages(world, domainId, factionId, actor)
    allMessages.push(...generated.messages)
    candidates.push(generated.candidate)
  }

  const routing = routeMessages(actors, allMessages)
  const agenda = compileAgenda(world, domainId, factionId, candidates)

  const dropped = Object.values(routing.droppedByReason).reduce((sum, value) => sum + value, 0)
  const metrics: DomainCommMetricsSnapshot = {
    domainId,
    factionId,
    tick: world.tick,
    published: allMessages.length,
    delivered: routing.deliveredCount,
    dropped,
    droppedByReason: routing.droppedByReason,
    conflictBuckets: routing.conflictBuckets,
    agendaCandidatesIn: candidates.length,
    agendaCandidatesOut: agenda.candidates.length,
  }

  return {
    domainId,
    factionId,
    tick: world.tick,
    agenda,
    metrics,
    messages: includeMessages ? routing.routed.map((item) => item.message) : undefined,
  }
}

export function runDomainCommWindow(world: WorldState): DomainCommWindowSummary {
  const domains: DomainCommPreviewResponse[] = []

  for (const factionId of Object.keys(world.factions)) {
    const preview = buildPreviewForFaction(world, factionId, false)
    if (!preview) continue
    domains.push(preview)

    const state = domainStates.get(preview.domainId) ?? {}
    state.lastAgenda = preview.agenda
    state.lastMetrics = preview.metrics
    domainStates.set(preview.domainId, state)
  }

  return {
    tick: world.tick,
    domains,
    totalPublished: domains.reduce((sum, item) => sum + item.metrics.published, 0),
    totalDelivered: domains.reduce((sum, item) => sum + item.metrics.delivered, 0),
    totalDropped: domains.reduce((sum, item) => sum + item.metrics.dropped, 0),
  }
}

export function previewDomainAgendaForFaction(
  world: WorldState,
  factionId: string,
  includeMessages = true,
): DomainCommPreviewResponse | null {
  return buildPreviewForFaction(world, factionId, includeMessages)
}

export function getDomainCommMetricsSnapshot(domainId: string): DomainCommMetricsSnapshot | null {
  return domainStates.get(domainId)?.lastMetrics ?? null
}

export function getDomainCommAgendaSnapshot(domainId: string): DomainAgenda | null {
  return domainStates.get(domainId)?.lastAgenda ?? null
}
