import type { PlanningFailureCategory } from '../../../../shared/contracts/game'

export class PlannerGatewayError extends Error {
  readonly category: PlanningFailureCategory
  readonly statusCode?: number
  readonly provider?: string

  constructor(
    message: string,
    options: {
      category: PlanningFailureCategory
      statusCode?: number
      provider?: string
    },
  ) {
    super(message)
    this.name = 'PlannerGatewayError'
    this.category = options.category
    this.statusCode = options.statusCode
    this.provider = options.provider
  }
}

export function classifyGatewayHttpStatus(status: number): PlanningFailureCategory {
  if (status === 408 || status === 504) {
    return 'gateway_timeout'
  }

  if (status === 401 || status === 402 || status === 403 || status === 429) {
    return 'gateway_quota'
  }

  if (status >= 500) {
    return 'provider_error'
  }

  return 'gateway_http'
}
