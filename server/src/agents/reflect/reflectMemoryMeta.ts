import type { NarrativeEvent } from '../../../../shared/contracts/game'

export type ReflectMemorySource = 'battle' | 'report' | 'alliance'

export function buildReflectMemoryMetadata(params: {
  source: ReflectMemorySource
  event: NarrativeEvent
}) {
  const { source, event } = params

  return {
    type: 'reflect' as const,
    source,
    narrativeId: event.id,
    significance: event.significance,
    causalLinks: event.causalChain.length,
    consequenceLinks: event.consequences.length,
  }
}
