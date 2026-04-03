import { readFileSync } from 'node:fs'
import type { PlanSource, PlannerConfig } from '../../../shared/contracts/game'

export type GatewayProtocol = 'openai_compat'

export type ResolvedPlannerTarget = {
  source: Exclude<PlanSource, 'mock'>
  label: string
  protocol: GatewayProtocol
  baseUrl: string
  apiKeys: string[]
  model: string
}


export type RelayModelDiscoveryTarget = {
  baseUrl: string
  apiKeys: string[]
}

const DEFAULT_LOCAL_ENDPOINT = 'http://127.0.0.1:8080/v1'
const DEFAULT_LOCAL_MODEL = 'qwen3.5-2b-q4_k_m'
const DEFAULT_RELAY_MODEL = 'openrouter/healer-alpha'

export function resolveRelayModelDiscoveryTarget(): RelayModelDiscoveryTarget {
  return {
    baseUrl: normalizeRelayBaseUrl(readRequiredEnv('LLM_RELAY_URL')),
    apiKeys: readRelayApiKeys(),
  }
}

export function resolvePlannerTarget(config: PlannerConfig): ResolvedPlannerTarget {
  if (config.mode === 'local') {
    return {
      source: 'local',
      label: '本地模型服务',
      protocol: 'openai_compat',
      baseUrl: normalizeLocalBaseUrl(readRequiredEnv('LOCAL_MODEL_ENDPOINT', DEFAULT_LOCAL_ENDPOINT)),
      apiKeys: [],
      model: pickModel(config.model, process.env.LOCAL_MODEL_NAME, DEFAULT_LOCAL_MODEL),
    }
  }

  if (config.mode === 'gateway') {
    // BYOK: 玩家自带 apiKey / baseUrl 优先级高于服务器全局配置
    const baseUrl = config.baseUrl
      ? normalizeRelayBaseUrl(config.baseUrl)
      : normalizeRelayBaseUrl(readRequiredEnv('LLM_RELAY_URL'))
    const apiKeys = config.apiKey ? [config.apiKey] : readRelayApiKeys()
    return {
      source: 'gateway',
      label: config.apiKey ? '玩家自带模型（BYOK）' : 'MUMU 模型中转站',
      protocol: readProtocol(),
      baseUrl,
      apiKeys,
      model: pickModel(config.model, process.env.LLM_RELAY_MODEL, DEFAULT_RELAY_MODEL),
    }
  }

  throw new Error(`不支持的规划模式：${config.mode}`)
}

function readProtocol(): GatewayProtocol {
  const protocol = readOptionalEnv('LLM_RELAY_PROTOCOL') ?? 'openai_compat'
  if (protocol !== 'openai_compat') {
    throw new Error(`当前仅支持 openai_compat 协议，收到：${protocol}`)
  }

  return protocol
}

function pickModel(overrideModel: string, envModel: string | undefined, fallbackModel: string) {
  return overrideModel.trim() || envModel?.trim() || fallbackModel
}

function normalizeLocalBaseUrl(baseUrl: string) {
  const normalized = trimTrailingSlash(baseUrl)
  if (normalized.endsWith('/chat/completions')) {
    return normalized.slice(0, -'/chat/completions'.length)
  }

  return normalized
}

function normalizeRelayBaseUrl(baseUrl: string) {
  const normalized = trimTrailingSlash(baseUrl)

  if (normalized.endsWith('/chat/completions')) {
    return normalized.slice(0, -'/chat/completions'.length)
  }

  if (normalized.endsWith('/models')) {
    return normalized.slice(0, -'/models'.length)
  }

  if (normalized.endsWith('/v1')) {
    return normalized
  }

  return `${normalized}/v1`
}

function trimTrailingSlash(value: string) {
  return value.trim().replace(/\/+$/, '')
}

function readRequiredEnv(name: string, fallback?: string) {
  const value = process.env[name]?.trim() || fallback?.trim()
  if (!value) {
    throw new Error(`缺少环境变量 ${name}。`)
  }

  return value
}

function readOptionalEnv(name: string) {
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

function readRelayApiKeys() {
  const tokens = [
    ...parseTokenList(readOptionalEnv('LLM_RELAY_API_KEYS')),
    ...readTokenFile(readOptionalEnv('LLM_RELAY_API_KEYS_FILE')),
    ...parseTokenList(readOptionalEnv('LLM_RELAY_API_KEY')),
    ...parseTokenList(readOptionalEnv('OPENAI_API_KEY')),
  ]

  return Array.from(new Set(tokens))
}

function readTokenFile(filePath: string | undefined) {
  if (!filePath) {
    return []
  }

  try {
    return parseTokenList(readFileSync(filePath, 'utf-8'))
  } catch (error) {
    throw new Error(
      `读取 LLM_RELAY_API_KEYS_FILE 失败：${error instanceof Error ? error.message : '未知错误'}`,
    )
  }
}

function parseTokenList(rawValue: string | undefined) {
  if (!rawValue) {
    return []
  }

  return rawValue
    .split(/[\r\n,\s]+/)
    .map((item) => item.trim())
    .filter(Boolean)
}
