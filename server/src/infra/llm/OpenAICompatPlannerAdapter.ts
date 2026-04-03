import type { PlannerResult } from '../../../../shared/contracts/game'
import type { CommanderToolContext } from '../../agents/tools/CommanderTools'
import type { ResolvedPlannerTarget } from '../../config/modelGateway'
import { PlannerGatewayError, classifyGatewayHttpStatus } from './errors'
import { buildPlannerMessages, createPlannerResultFromText } from './plannerProtocol'

type OpenAICompatibleChatResponse = {
  error?: {
    message?: string
  }
  choices?: Array<{
    message?: {
      content?: string
      reasoning?: string
    }
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
}

type TimeoutHandle = {
  signal: AbortSignal
  cleanup: () => void
}

export async function createOpenAICompatiblePlanningResult(
  strategicCommand: string,
  target: ResolvedPlannerTarget,
  toolContext: CommanderToolContext,
): Promise<PlannerResult> {
  const maxTokens = readPlannerMaxTokens()
  const requestPayload: {
    model: string
    temperature: number
    max_tokens?: number
    messages: ReturnType<typeof buildPlannerMessages>
  } = {
    model: target.model,
    temperature: 0.2,
    messages: buildPlannerMessages(strategicCommand, toolContext, {
      compactContext: readForceCompactContext(),
    }),
  }

  if (typeof maxTokens === 'number') {
    requestPayload.max_tokens = maxTokens
  }

  const requestBody = JSON.stringify(requestPayload)

  const apiKeys = rotateApiKeys(target.apiKeys)
  const timeoutMs = readPlannerRequestTimeoutMs()
  const maxElapsedMs = readPlannerMaxElapsedMs(timeoutMs)
  const retryBaseMs = readPlannerRetryBaseMs()
  const retryMaxMs = readPlannerRetryMaxMs(retryBaseMs)
  const maxAttempts = readPlannerMaxAttempts()
  const canRotateKey = target.apiKeys.length > 1

  let lastError = ''
  const startedAt = Date.now()
  // P1-6: 优先通过 AI-Server 代理 Commander LLM 调用
  const aiServerUrl = process.env.AI_SERVER_URL
  const endpoint = aiServerUrl
    ? normalizeChatEndpoint(aiServerUrl)
    : normalizeChatEndpoint(target.baseUrl)

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const apiKey = apiKeys[attempt % apiKeys.length]
    const isLastAttempt = attempt === maxAttempts - 1

    try {
      const elapsedBeforeAttempt = Date.now() - startedAt
      const remainingBudgetMs = maxElapsedMs - elapsedBeforeAttempt
      if (remainingBudgetMs <= 0) {
        throw new PlannerGatewayError(
          `${target.label} timeout: exceeded total retry budget (${maxElapsedMs}ms)`,
          {
            category: 'gateway_timeout',
            provider: target.label,
          },
        )
      }

      const attemptTimeoutMs = Math.max(1000, Math.min(timeoutMs, remainingBudgetMs))
      const timeoutHandle = createTimeoutHandle(attemptTimeoutMs)
      let response: Response

      try {
        response = await fetch(endpoint, {
          method: 'POST',
          headers: buildHeaders(apiKey),
          body: requestBody,
          signal: timeoutHandle.signal,
        })
      } finally {
        timeoutHandle.cleanup()
      }

      if (!response.ok) {
        lastError = await buildGatewayErrorMessage(target.label, response)
        const category = classifyGatewayHttpStatus(response.status)

        if (!isLastAttempt && shouldRetryHttpStatus(response.status, canRotateKey)) {
          await waitBeforeRetry(
            attempt,
            retryBaseMs,
            retryMaxMs,
            maxElapsedMs - (Date.now() - startedAt),
          )
          continue
        }

        throw new PlannerGatewayError(lastError, {
          category,
          statusCode: response.status,
          provider: target.label,
        })
      }

      const payload = (await response.json()) as OpenAICompatibleChatResponse
      // reasoning 模型（如 nemotron）可能把内容放在 reasoning 字段，content 为 null
      const msg = payload.choices?.[0]?.message
      const rawText = (msg?.content ?? msg?.reasoning)?.trim()
      if (!rawText) {
        lastError = `${target.label} returned empty completion`

        if (!isLastAttempt) {
          await waitBeforeRetry(
            attempt,
            retryBaseMs,
            retryMaxMs,
            maxElapsedMs - (Date.now() - startedAt),
          )
          continue
        }

        throw new PlannerGatewayError(lastError, {
          category: 'provider_error',
          provider: target.label,
        })
      }

      return createPlannerResultFromText({
        source: target.source,
        rawText,
        note: `planner response generated via ${target.label} (${target.model})`,
        metrics: {
          gatewayProvider: target.source === 'gateway' ? 'mumu_relay' : 'local_model',
          model: target.model,
          latencyMs: Date.now() - startedAt,
          promptTokens: payload.usage?.prompt_tokens,
          completionTokens: payload.usage?.completion_tokens,
          totalTokens: payload.usage?.total_tokens,
          estimatedCostUsd: estimateCostUsd(payload.usage?.total_tokens),
        },
        fallbackOrderHint: buildFallbackOrderHint(toolContext),
      })
    } catch (error) {
      const normalizedError = normalizePlannerError(error, target.label)
      lastError = normalizedError.message

      if (!isLastAttempt && shouldRetryPlannerError(normalizedError)) {
        await waitBeforeRetry(
          attempt,
          retryBaseMs,
          retryMaxMs,
          maxElapsedMs - (Date.now() - startedAt),
        )
        continue
      }

      throw normalizedError
    }
  }

  throw new PlannerGatewayError(lastError || `${target.label} failed after retrying attempts`, {
    category: 'gateway_http',
    provider: target.label,
  })
}

function normalizeChatEndpoint(baseUrl: string) {
  const normalized = baseUrl.trim().replace(/\/+$/, '')
  return normalized.endsWith('/chat/completions') ? normalized : `${normalized}/chat/completions`
}

function buildHeaders(apiKey?: string) {
  return {
    'Content-Type': 'application/json',
    ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
  }
}


function readForceCompactContext() {
  const raw = process.env.PLANNER_FORCE_COMPACT_CONTEXT?.trim().toLowerCase()
  return raw === '1' || raw === 'true' || raw === 'yes'
}

function readPlannerMaxTokens() {
  const raw = process.env.PLANNER_MAX_TOKENS?.trim()
  if (!raw) {
    return undefined
  }

  const rawValue = Number(raw)
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return undefined
  }

  return Math.max(128, Math.round(rawValue))
}

function readPlannerRequestTimeoutMs() {
  const rawValue = Number(process.env.PLANNER_REQUEST_TIMEOUT_MS ?? 45000)
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return 45000
  }

  return Math.max(3000, Math.min(180000, Math.round(rawValue)))
}

function readPlannerMaxElapsedMs(perCallTimeoutMs: number) {
  const defaultBudgetMs = Math.max(perCallTimeoutMs, 65000)
  const rawValue = Number(process.env.PLANNER_REQUEST_MAX_ELAPSED_MS ?? defaultBudgetMs)
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return defaultBudgetMs
  }

  return Math.max(3000, Math.min(300000, Math.round(rawValue)))
}

function readPlannerMaxAttempts() {
  const rawValue = Number(process.env.PLANNER_REQUEST_MAX_ATTEMPTS ?? 3)
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return 3
  }

  return Math.max(1, Math.min(8, Math.round(rawValue)))
}

function readPlannerRetryBaseMs() {
  const rawValue = Number(process.env.PLANNER_REQUEST_RETRY_BASE_MS ?? 600)
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return 600
  }

  return Math.max(50, Math.min(5000, Math.round(rawValue)))
}

function readPlannerRetryMaxMs(baseMs: number) {
  const rawValue = Number(process.env.PLANNER_REQUEST_RETRY_MAX_MS ?? 4000)
  if (!Number.isFinite(rawValue) || rawValue <= 0) {
    return Math.max(baseMs, 4000)
  }

  return Math.max(baseMs, Math.min(20000, Math.round(rawValue)))
}

function createTimeoutHandle(timeoutMs: number): TimeoutHandle {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  }
}

async function buildGatewayErrorMessage(label: string, response: Response) {
  const fallback = `${label} request failed with HTTP ${response.status}`

  try {
    const rawText = await response.text()
    if (!rawText.trim()) {
      return fallback
    }

    const payload = JSON.parse(rawText) as OpenAICompatibleChatResponse
    const message = payload.error?.message?.trim()
    return message ? `${label} responded with error: ${message}` : `${fallback} ${rawText}`
  } catch {
    return fallback
  }
}

let nextApiKeyIndex = 0

function rotateApiKeys(apiKeys: string[]) {
  if (apiKeys.length === 0) {
    return [undefined]
  }

  const startIndex = nextApiKeyIndex % apiKeys.length
  nextApiKeyIndex = (nextApiKeyIndex + 1) % apiKeys.length

  return [...apiKeys.slice(startIndex), ...apiKeys.slice(0, startIndex)]
}

function shouldRetryHttpStatus(status: number, canRotateKey: boolean) {
  if (status === 408 || status === 409 || status === 425 || status === 429 || status >= 500) {
    return true
  }

  if (canRotateKey && (status === 401 || status === 402 || status === 403)) {
    return true
  }

  return false
}

function normalizePlannerError(error: unknown, provider: string) {
  if (error instanceof PlannerGatewayError) {
    return error
  }

  if (isTimeoutLikeError(error)) {
    const message = error instanceof Error ? error.message : 'planner request timed out'
    return new PlannerGatewayError(`${provider} timeout: ${message}`, {
      category: 'gateway_timeout',
      provider,
    })
  }

  if (error instanceof TypeError) {
    return new PlannerGatewayError(`${provider} network failure: ${error.message}`, {
      category: 'gateway_network',
      provider,
    })
  }

  if (error instanceof Error) {
    return new PlannerGatewayError(error.message, {
      category: 'provider_error',
      provider,
    })
  }

  return new PlannerGatewayError(`${provider} unknown failure`, {
    category: 'unknown',
    provider,
  })
}

function shouldRetryPlannerError(error: PlannerGatewayError) {
  if (error.category === 'gateway_network' || error.category === 'gateway_timeout') {
    return true
  }

  if (error.category !== 'provider_error') {
    return false
  }

  const normalizedMessage = error.message.toLowerCase()
  return (
    normalizedMessage.includes('empty completion') ||
    normalizedMessage.includes('not valid json') ||
    normalizedMessage.includes('does not include a json object') ||
    normalizedMessage.includes('econnreset') ||
    normalizedMessage.includes('socket hang up')
  )
}

function isTimeoutLikeError(error: unknown) {
  if (!(error instanceof Error)) {
    return false
  }

  const name = error.name.toLowerCase()
  const message = error.message.toLowerCase()
  return (
    name.includes('timeout') ||
    name.includes('abort') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('aborted')
  )
}

async function waitBeforeRetry(
  attempt: number,
  baseMs: number,
  maxMs: number,
  remainingBudgetMs?: number,
) {
  const exp = Math.min(6, Math.max(0, attempt))
  const delay = Math.min(maxMs, baseMs * 2 ** exp)
  const jitter = Math.floor(Math.random() * Math.max(40, Math.floor(delay * 0.2)))
  const plannedWait = delay + jitter

  if (typeof remainingBudgetMs === 'number') {
    if (!Number.isFinite(remainingBudgetMs) || remainingBudgetMs <= 0) {
      return
    }

    await sleep(Math.min(plannedWait, remainingBudgetMs))
    return
  }

  await sleep(plannedWait)
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms)
  })
}

function buildFallbackOrderHint(toolContext: CommanderToolContext) {
  const firstAvailable = toolContext.availableUnits.find((item) => item.available) ?? toolContext.availableUnits[0]
  if (!firstAvailable) {
    return undefined
  }

  return {
    unitId: firstAvailable.id,
    target: firstAvailable.tileId,
  }
}

function estimateCostUsd(totalTokens: number | undefined) {
  if (!totalTokens) {
    return undefined
  }

  const pricePerMillion = Number(process.env.PLANNER_PRICE_PER_MILLION_USD ?? 0)
  if (!Number.isFinite(pricePerMillion) || pricePerMillion <= 0) {
    return undefined
  }

  return Number(((totalTokens / 1_000_000) * pricePerMillion).toFixed(6))
}
