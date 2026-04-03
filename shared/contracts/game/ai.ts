import type { StrategicPlan } from './planning'
import type { PlannerMetrics, PlannerMode, PlanSource, PlanningJobStatus } from './common'

export type PlannerConfig = {
  mode: PlannerMode
  model: string
  /** 玩家自带的 API key（BYOK）。优先级高于服务器全局 LLM_API_KEY。 */
  apiKey?: string
  /** 玩家自定义的模型 endpoint（BYOK）。优先级高于 LLM_RELAY_URL。 */
  baseUrl?: string
}

export type PlannerResult = {
  source: PlanSource
  plan: StrategicPlan
  note?: string
  explanation?: string
  planningRationale?: string[]
  rawText?: string
  metrics?: PlannerMetrics
}

export type AiModelSource = 'live' | 'cache' | 'fallback'

export type AiModelDescriptor = {
  id: string
  name: string
  provider: string
  contextWindow?: number
  tags: string[]
  available: boolean
}

export type AiModelsResponse = {
  items: AiModelDescriptor[]
  source: AiModelSource
  fetchedAt: string
  stale: boolean
  error?: string
}

export type AiLogEntry = {
  id: string
  status: PlanningJobStatus
  sourceMode: PlannerMode
  requestedTick: number
  requestedWorldVersion: number
  message: string
  resolvedSource?: PlanSource
  plannerNote?: string
  completedTick?: number
  completedWorldVersion?: number
}

export type AiLogsResponse = {
  items: AiLogEntry[]
  limit: number
  fetchedAt: string
}

export type AiRiskPreference = 'conservative' | 'balanced' | 'aggressive'

export type AiModelRoleConfig = {
  commander: string
  general: string
  unit: string
}

export type AiHubConfig = {
  automationEnabled: boolean
  plannerFrequency: number
  riskPreference: AiRiskPreference
  doctrinePrompt: string
  models: AiModelRoleConfig
}

export type AiConfigResponse = {
  config: AiHubConfig
  updatedAt: string
  factionId: string
}

export type AiConfigUpdateRequest = {
  config: AiHubConfig
  factionId?: string
}
