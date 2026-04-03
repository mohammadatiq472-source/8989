import type { AiConfigResponse, AiHubConfig } from '../../../../shared/contracts/game'

const DEFAULT_FACTION_ID = 'neutral'

const defaultConfig: AiHubConfig = {
  automationEnabled: true,
  plannerFrequency: 2,
  riskPreference: 'balanced',
  doctrinePrompt: process.env.AI_DOCTRINE_PROMPT?.trim() || 'Secure passes first, then expand macro regions.',
  models: {
    commander: process.env.LLM_RELAY_MODEL?.trim() || process.env.LOCAL_MODEL_NAME?.trim() || 'qwen/qwen3.5-flash-02-23',
    general: process.env.LLM_RELAY_MODEL?.trim() || process.env.LOCAL_MODEL_NAME?.trim() || 'qwen/qwen3.5-flash-02-23',
    unit: process.env.LLM_RELAY_MODEL?.trim() || process.env.LOCAL_MODEL_NAME?.trim() || 'qwen/qwen3.5-flash-02-23',
  },
}

const aiHubConfigByFaction = new Map<string, AiHubConfig>()
const updatedAtByFaction = new Map<string, string>()

function normalizeFactionId(factionId?: string): string {
  const normalized = factionId?.trim()
  return normalized ? normalized : DEFAULT_FACTION_ID
}

function resolveConfigForFaction(factionId: string): AiHubConfig {
  return aiHubConfigByFaction.get(factionId) ?? defaultConfig
}

function resolveUpdatedAtForFaction(factionId: string): string {
  return updatedAtByFaction.get(factionId) ?? new Date(0).toISOString()
}

export function getAiHubConfig(factionId?: string): AiConfigResponse {
  const normalizedFactionId = normalizeFactionId(factionId)
  return {
    config: structuredClone(resolveConfigForFaction(normalizedFactionId)),
    updatedAt: resolveUpdatedAtForFaction(normalizedFactionId),
    factionId: normalizedFactionId,
  }
}

export function updateAiHubConfig(config: AiHubConfig, factionId?: string): AiConfigResponse {
  const normalizedFactionId = normalizeFactionId(factionId)
  const nextUpdatedAt = new Date().toISOString()
  aiHubConfigByFaction.set(normalizedFactionId, structuredClone(config))
  updatedAtByFaction.set(normalizedFactionId, nextUpdatedAt)

  return {
    config: structuredClone(config),
    updatedAt: nextUpdatedAt,
    factionId: normalizedFactionId,
  }
}
