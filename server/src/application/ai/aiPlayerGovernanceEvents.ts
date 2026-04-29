import { appendRuntimeWorldEvent } from '../world/WorldService'

export function recordAiPlayerGovernanceEvent(params: {
  action: string
  success: boolean
  message: string
  metadata?: Record<string, unknown>
}) {
  appendRuntimeWorldEvent({
    category: 'system',
    action: params.action,
    success: params.success,
    message: params.message,
    metadata: params.metadata,
  })
}
