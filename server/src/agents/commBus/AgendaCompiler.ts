import type { DomainAgendaCandidate, DomainCommPreviewResponse, NationalAgendaOption, NationalAgendaWindow } from '../../../../shared/contracts/commBus'
import { nationalAgendaWindowSchema } from '../../../../shared/schemas/commBus'

type RecommendedAction = NationalAgendaOption['recommendedAction']

type IntentBucket = {
  key: string
  title: string
  recommendedAction: RecommendedAction
  matchers: RegExp[]
}

const INTENT_BUCKETS: IntentBucket[] = [
  {
    key: 'reinforce_frontline',
    title: 'Reinforce frontline pressure points',
    recommendedAction: 'reinforce',
    matchers: [/reinforce/i, /support/i, /hotspot/i, /frontline/i],
  },
  {
    key: 'stabilize_supply',
    title: 'Stabilize supply and sustain lines',
    recommendedAction: 'stabilize',
    matchers: [/supply/i, /logistics/i, /resource/i, /stabilize/i],
  },
  {
    key: 'expand_capture',
    title: 'Expand with controlled capture operations',
    recommendedAction: 'capture',
    matchers: [/capture/i, /expand/i, /seize/i, /breakthrough/i],
  },
  {
    key: 'intel_recon',
    title: 'Recon first before commitment',
    recommendedAction: 'recon_first',
    matchers: [/intel/i, /recon/i, /scout/i, /snapshot/i],
  },
  {
    key: 'diplomatic_posture',
    title: 'Diplomatic posture alignment',
    recommendedAction: 'diplomacy',
    matchers: [/diplomacy/i, /treaty/i, /ceasefire/i, /alliance/i],
  },
]

function normalizeIntent(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80)
}

function priorityWeight(priority: DomainAgendaCandidate['priority']): number {
  if (priority === 'P0') return 3
  if (priority === 'P1') return 2
  return 1
}

function resolveBucket(intent: string): IntentBucket {
  for (const bucket of INTENT_BUCKETS) {
    if (bucket.matchers.some((pattern) => pattern.test(intent))) {
      return bucket
    }
  }

  const normalized = normalizeIntent(intent)
  return {
    key: normalized || 'hold_line',
    title: `Coordinate ${normalized || 'hold_line'} actions`,
    recommendedAction: 'hold',
    matchers: [],
  }
}

function mergePriority(
  left: DomainAgendaCandidate['priority'],
  right: DomainAgendaCandidate['priority'],
): DomainAgendaCandidate['priority'] {
  return priorityWeight(left) >= priorityWeight(right) ? left : right
}

type BucketAccumulator = {
  key: string
  title: string
  recommendedAction: RecommendedAction
  priority: DomainAgendaCandidate['priority']
  sourceDomainIds: Set<string>
  sourceFactionIds: Set<string>
  supportingAiPlayerIds: Set<string>
  candidateIntents: Set<string>
  score: number
}

function compareOptions(left: NationalAgendaOption, right: NationalAgendaOption) {
  const byPriority = priorityWeight(right.priority) - priorityWeight(left.priority)
  if (byPriority !== 0) return byPriority

  const byDomain = right.sourceDomainIds.length - left.sourceDomainIds.length
  if (byDomain !== 0) return byDomain

  const bySupport = right.supportingAiPlayerIds.length - left.supportingAiPlayerIds.length
  if (bySupport !== 0) return bySupport

  return left.intentKey.localeCompare(right.intentKey)
}

export function compileNationalAgendaWindow(params: {
  tick: number
  domainPreviews: DomainCommPreviewResponse[]
  maxOptions?: number
}): NationalAgendaWindow {
  const maxOptions = Number.isFinite(params.maxOptions)
    ? Math.max(1, Math.min(9, Math.floor(params.maxOptions ?? 9)))
    : 9

  const buckets = new Map<string, BucketAccumulator>()
  let optionCountIn = 0

  for (const preview of params.domainPreviews) {
    for (const candidate of preview.agenda.candidates) {
      optionCountIn += 1
      const bucket = resolveBucket(candidate.intent)
      const existing = buckets.get(bucket.key)
      if (!existing) {
        buckets.set(bucket.key, {
          key: bucket.key,
          title: bucket.title,
          recommendedAction: bucket.recommendedAction,
          priority: candidate.priority,
          sourceDomainIds: new Set([preview.domainId]),
          sourceFactionIds: new Set([preview.factionId]),
          supportingAiPlayerIds: new Set(candidate.supportingAiPlayerIds),
          candidateIntents: new Set([candidate.intent]),
          score: priorityWeight(candidate.priority) * 10 + candidate.supportingAiPlayerIds.length,
        })
        continue
      }

      existing.priority = mergePriority(existing.priority, candidate.priority)
      existing.sourceDomainIds.add(preview.domainId)
      existing.sourceFactionIds.add(preview.factionId)
      for (const aiPlayerId of candidate.supportingAiPlayerIds) {
        existing.supportingAiPlayerIds.add(aiPlayerId)
      }
      existing.candidateIntents.add(candidate.intent)
      existing.score += priorityWeight(candidate.priority) * 4 + candidate.supportingAiPlayerIds.length
    }
  }

  const options: NationalAgendaOption[] = Array.from(buckets.values())
    .map((bucket, index) => {
      const sourceDomainIds = Array.from(bucket.sourceDomainIds).sort()
      const sourceFactionIds = Array.from(bucket.sourceFactionIds).sort()
      const supportingAiPlayerIds = Array.from(bucket.supportingAiPlayerIds).sort()
      const candidateIntents = Array.from(bucket.candidateIntents).sort()

      const confidence = Math.min(0.98, Number((
        0.42 +
        priorityWeight(bucket.priority) * 0.11 +
        sourceDomainIds.length * 0.05 +
        supportingAiPlayerIds.length * 0.015
      ).toFixed(3)))

      return {
        id: `national_agenda_option_${params.tick}_${index + 1}_${bucket.key}`,
        tick: params.tick,
        intentKey: bucket.key,
        title: bucket.title,
        summary: `${bucket.title} (domains=${sourceDomainIds.length}, supporters=${supportingAiPlayerIds.length})`,
        priority: bucket.priority,
        sourceDomainIds,
        sourceFactionIds,
        supportingAiPlayerIds,
        candidateIntents,
        recommendedAction: bucket.recommendedAction,
        confidence,
      }
    })
    .sort(compareOptions)
    .slice(0, maxOptions)

  const window: NationalAgendaWindow = {
    id: `national_agenda_${params.tick}`,
    tick: params.tick,
    optionCountIn,
    optionCountOut: options.length,
    options,
    summary:
      options.length > 0
        ? `National agenda: ${options.map((option) => option.intentKey).join(', ')}`
        : 'National agenda: no options generated',
    generatedAt: Date.now(),
  }

  return nationalAgendaWindowSchema.parse(window)
}
