import type { AiPlayerActionProposalRequest } from '../../../../shared/contracts/aiPlayer'
import { renderAiPlayerRuntimeSystemPrompt } from '../../../../shared/contracts/aiPlayerRuntimePrompt'
import {
  aiPlayerActionProposalRequestSchema,
} from '../../../../shared/schemas/aiPlayer'
import {
  parseAiPlayerRuntimeModelOutput,
  type AiPlayerRuntimeModelOutput,
} from '../../../../shared/schemas/aiPlayerRuntimePrompt'
import type { ResolvedPlannerTarget } from '../../config/modelGateway'
import type {
  AiPlayerRuntimeModelTargetCandidate,
  AiPlayerRuntimeModelTargetFailure,
} from './aiPlayerRuntimeModelTarget'

export type AiPlayerRuntimeProposalObservation = {
  aiPlayerId: string
  runtime: unknown
  world?: unknown
  receipts?: unknown[]
  failures?: unknown[]
}

export type AiPlayerRuntimeProposalModelMessage = {
  role: 'system' | 'user'
  content: string
}

export type AiPlayerRuntimeProposalModelRequest = {
  target: ResolvedPlannerTarget
  observation: AiPlayerRuntimeProposalObservation
  fetchImpl?: typeof fetch
}

export type AiPlayerRuntimeProposalCandidateRequest = {
  candidates: AiPlayerRuntimeModelTargetCandidate[]
  observation: AiPlayerRuntimeProposalObservation
  fetchImpl?: typeof fetch
  reserveCandidateAttempt?: (
    candidate: AiPlayerRuntimeModelTargetCandidate,
  ) => Promise<AiPlayerRuntimeProposalBudgetReservationResult> | AiPlayerRuntimeProposalBudgetReservationResult
  commitCandidateAttempt?: (
    candidate: AiPlayerRuntimeModelTargetCandidate,
    result: ModelProposalResult,
    reservation: AiPlayerRuntimeProposalBudgetReservation | null,
  ) => Promise<void> | void
}

export type AiPlayerRuntimeProposalSelectedProvider = {
  model: string
  provider: string
  source: AiPlayerRuntimeModelTargetCandidate['source']
  byokSource: AiPlayerRuntimeModelTargetCandidate['byokSource']
  priority: number
}

export type AiPlayerRuntimeProposalBudgetReservation = {
  reservationId?: string
  budgetWindowKey?: string
  limitMode?: 'unlimited' | 'configured' | 'disabled'
}

export type AiPlayerRuntimeProposalBudgetReservationResult =
  | ({ ok: true } & AiPlayerRuntimeProposalBudgetReservation)
  | ({ ok: false; error: string } & AiPlayerRuntimeProposalBudgetReservation)

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: unknown
    }
  }>
  usage?: unknown
  model?: unknown
}

const AUTH_RETRY_STATUSES = new Set([401, 403])

export type ModelProposalResult =
  | {
    ok: true
    output: AiPlayerRuntimeModelOutput
    proposalRequests: AiPlayerActionProposalRequest[]
    model: string
    usage?: unknown
    normalization?: 'markdown_fence_after_retry'
    selectedProvider?: AiPlayerRuntimeProposalSelectedProvider
    providerFallbackFailures?: AiPlayerRuntimeModelTargetFailure[]
    budgetReservationId?: string
    budgetWindowKey?: string
  }
  | {
    ok: false
    error: string
    providerFallbackFailures?: AiPlayerRuntimeModelTargetFailure[]
  }

function resolveProviderLabel(baseUrl: string) {
  try {
    return new URL(baseUrl).host || 'relay'
  } catch {
    return 'relay'
  }
}

function toSelectedProvider(candidate: AiPlayerRuntimeModelTargetCandidate): AiPlayerRuntimeProposalSelectedProvider {
  return {
    model: candidate.target.model,
    provider: resolveProviderLabel(candidate.target.baseUrl),
    source: candidate.source,
    byokSource: candidate.byokSource,
    priority: candidate.priority,
  }
}

function toTargetFailure(
  candidate: AiPlayerRuntimeModelTargetCandidate,
  error: string,
): AiPlayerRuntimeModelTargetFailure {
  return {
    model: candidate.target.model,
    source: candidate.source,
    byokSource: candidate.byokSource,
    priority: candidate.priority,
    error,
  }
}

function formatRawJsonShape(rawContent: string) {
  const trimmed = rawContent.trim()
  if (trimmed.startsWith('```')) {
    return 'markdown_fence'
  }
  if (!trimmed.startsWith('{')) {
    return 'missing_object_prefix'
  }
  if (!trimmed.endsWith('}')) {
    return 'missing_object_suffix'
  }
  return 'object_syntax_error'
}

function unwrapMarkdownJsonFence(rawContent: string) {
  const trimmed = rawContent.trim()
  const match = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed)
  if (!match) {
    return null
  }
  const inner = match[1]?.trim()
  if (!inner?.startsWith('{') || !inner.endsWith('}')) {
    return null
  }
  return inner
}

function formatModelOutputParseError(error: unknown, rawContent?: string) {
  const issueSource = error && typeof error === 'object'
    ? error as { issues?: Array<{ path?: Array<string | number>; message?: string; code?: string }> }
    : {}
  const issues = Array.isArray(issueSource.issues)
    ? issueSource.issues.slice(0, 3).map((issue) => {
      const path = issue.path?.join('.') || 'output'
      const message = issue.code || issue.message || 'invalid'
      return `${path}:${message}`
    })
    : []
  if (issues.length > 0) {
    return `model_response_invalid_json_proposal:${issues.join('|')}`
  }
  if (error instanceof SyntaxError) {
    return `model_response_invalid_json_proposal:json_parse_error:${formatRawJsonShape(rawContent ?? '')}`
  }
  return 'model_response_invalid_json_proposal'
}

export function buildAiPlayerRuntimeProposalMessages(
  observation: AiPlayerRuntimeProposalObservation,
): AiPlayerRuntimeProposalModelMessage[] {
  return [
    {
      role: 'system',
      content: renderAiPlayerRuntimeSystemPrompt(),
    },
    {
      role: 'user',
      content: JSON.stringify({
        task: 'Choose governed AI player action proposals from the supplied observation.',
        strictJsonOnly: 'Return exactly one JSON object. The whole assistant message must be JSON.parse-able as-is. Do not wrap it in markdown fences or explanatory text.',
        hardFailureIfNotRawJson: 'If the first character is not { or the last character is not }, the proposal gate fails.',
        outputTransport: 'Return compact JSON text directly, preferably on one line. Never start with ```json, ```, Here is, or any natural-language prefix.',
        numericCommandRule: 'When the player command names a resource amount, use that exact amount in args.resources. Never replace a requested amount with all available resources.',
        outputShape: {
          summary: 'short optional string',
          proposals: [
            {
              action: 'one action from the runtime actionWhitelist and AI_PLAYER_RUNTIME_ALLOWED_ACTIONS',
              args: 'object with action-specific arguments; use {} when no args are needed',
              reason: 'four short player-readable clauses in the exact order: 资源：...；目标：...；风险：...；批准后结果：...',
            },
          ],
          deferReason: 'string; use empty string when proposing actions',
          needsHumanReview: true,
        },
        validExample: {
          summary: 'transfer available AI resources to the governor inbox',
          proposals: [
            {
              action: 'resource_transfer_to_governor',
              args: {
                resources: {
                  wood: 11,
                },
              },
              reason: '资源：AI 子账户木材 11 可输送；目标：转入总督通用收件箱；风险：需要人工批准且受额度/冷却约束；批准后结果：后端执行资源输送并生成 receipt。',
            },
          ],
          deferReason: '',
          needsHumanReview: true,
        },
        aiPlayerId: observation.aiPlayerId,
        runtime: observation.runtime,
        world: observation.world ?? null,
        receipts: observation.receipts ?? [],
        failures: observation.failures ?? [],
      }),
    },
  ]
}

export function parseAiPlayerRuntimeProposalJson(rawContent: string): AiPlayerRuntimeModelOutput {
  return parseAiPlayerRuntimeModelOutput(JSON.parse(rawContent))
}

export function toAiPlayerActionProposalRequests(
  aiPlayerId: string,
  output: AiPlayerRuntimeModelOutput,
): AiPlayerActionProposalRequest[] {
  return output.proposals.map((proposal) => {
    const request = {
      aiPlayerId,
      action: proposal.action,
      args: proposal.args,
      reason: proposal.reason,
      source: 'llm',
    } satisfies AiPlayerActionProposalRequest
    return aiPlayerActionProposalRequestSchema.parse(request)
  })
}

export async function requestAiPlayerRuntimeProposalFromModel({
  target,
  observation,
  fetchImpl = fetch,
}: AiPlayerRuntimeProposalModelRequest): Promise<ModelProposalResult> {
  const apiKeys = Array.from(new Set(target.apiKeys.map((apiKey) => apiKey.trim()).filter(Boolean)))
  if (apiKeys.length === 0) {
    return {
      ok: false,
      error: 'missing_model_api_key',
    }
  }

  const requestPayload = async (
    messages: AiPlayerRuntimeProposalModelMessage[],
  ): Promise<{ ok: true; payload: ChatCompletionResponse } | { ok: false; error: string }> => {
    const requestBody = JSON.stringify({
      model: target.model,
      messages,
      temperature: 0,
      max_tokens: 800,
      response_format: { type: 'json_object' },
    })

    let response: Response | null = null
    for (let index = 0; index < apiKeys.length; index += 1) {
      response = await fetchImpl(`${target.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKeys[index]}`,
          'Content-Type': 'application/json',
        },
        body: requestBody,
      })
      if (response.ok) {
        break
      }
      if (!AUTH_RETRY_STATUSES.has(response.status) || index === apiKeys.length - 1) {
        return {
          ok: false,
          error: `model_request_failed_${response.status}`,
        }
      }
    }

    if (!response?.ok) {
      return {
        ok: false,
        error: 'model_request_failed_no_response',
      }
    }
    return {
      ok: true,
      payload: await response.json() as ChatCompletionResponse,
    }
  }

  const parsePayload = (
    payload: ChatCompletionResponse,
    options: { allowMarkdownFenceNormalization?: boolean } = {},
  ): ModelProposalResult => {
    const rawContent = payload.choices?.[0]?.message?.content
    if (typeof rawContent !== 'string' || rawContent.trim() === '') {
      return {
        ok: false,
        error: 'model_response_missing_content',
      }
    }

    try {
      const output = parseAiPlayerRuntimeProposalJson(rawContent)
      return {
        ok: true,
        output,
        proposalRequests: toAiPlayerActionProposalRequests(observation.aiPlayerId, output),
        model: typeof payload.model === 'string' ? payload.model : target.model,
        usage: payload.usage,
      }
    } catch (error) {
      if (options.allowMarkdownFenceNormalization) {
        const unwrapped = unwrapMarkdownJsonFence(rawContent)
        if (unwrapped) {
          try {
            const output = parseAiPlayerRuntimeProposalJson(unwrapped)
            return {
              ok: true,
              output,
              proposalRequests: toAiPlayerActionProposalRequests(observation.aiPlayerId, output),
              model: typeof payload.model === 'string' ? payload.model : target.model,
              usage: payload.usage,
              normalization: 'markdown_fence_after_retry',
            }
          } catch {
            // Preserve the original raw-content parse error below.
          }
        }
      }
      return {
        ok: false,
        error: formatModelOutputParseError(error, rawContent),
      }
    }
  }

  const baseMessages = buildAiPlayerRuntimeProposalMessages(observation)
  const firstPayload = await requestPayload(baseMessages)
  if (!firstPayload.ok) {
    return firstPayload
  }
  const firstResult = parsePayload(firstPayload.payload)
  if (firstResult.ok || !firstResult.error.includes('json_parse_error')) {
    return firstResult
  }

  const retryPayload = await requestPayload([
    ...baseMessages,
    {
      role: 'user',
      content: JSON.stringify({
        correction: 'The previous response was rejected before proposal creation because it was not raw JSON.',
        required: 'Return exactly one JSON object that JSON.parse can read directly. No markdown fences. No prose. No code block language label.',
        hardFailureIfWrapped: 'A response starting with ```json or ``` is invalid even if the JSON inside is valid.',
        compactJsonOnly: 'The next assistant message must be compact raw JSON text only.',
        firstCharacterMustBe: '{',
        lastCharacterMustBe: '}',
      }),
    },
  ])
  if (!retryPayload.ok) {
    return retryPayload
  }
  const retryResult = parsePayload(retryPayload.payload)
  if (retryResult.ok || !retryResult.error.includes('json_parse_error')) {
    return retryResult
  }

  const finalRetryPayload = await requestPayload([
    ...baseMessages,
    {
      role: 'user',
      content: JSON.stringify({
        correction: 'The previous correction still failed because the assistant response was not raw JSON.',
        hardRequirement: 'Return only the JSON object text. Do not include markdown, backticks, code fences, labels, prose, or comments.',
        failureExampleDoNotDoThis: '```json\\n{...}\\n```',
        validStart: '{"summary"',
        validEnd: '}',
        responseMustBeOnlyThisShape: {
          summary: 'short optional string',
          proposals: [
            {
              action: 'resource_transfer_to_governor',
              args: {
                resources: {
                  wood: 11,
                },
              },
              reason: '资源：...；目标：...；风险：...；批准后结果：...',
            },
          ],
          deferReason: '',
          needsHumanReview: true,
        },
      }),
    },
  ])
  if (!finalRetryPayload.ok) {
    return finalRetryPayload
  }
  const finalRetryResult = parsePayload(finalRetryPayload.payload)
  if (finalRetryResult.ok) {
    return finalRetryResult
  }
  return parsePayload(finalRetryPayload.payload, { allowMarkdownFenceNormalization: true })
}

export async function requestAiPlayerRuntimeProposalFromCandidateTargets({
  candidates,
  observation,
  fetchImpl = fetch,
  reserveCandidateAttempt,
  commitCandidateAttempt,
}: AiPlayerRuntimeProposalCandidateRequest): Promise<ModelProposalResult> {
  const failures: AiPlayerRuntimeModelTargetFailure[] = []
  for (const candidate of candidates) {
    if (candidate.target.apiKeys.length === 0) {
      failures.push(toTargetFailure(candidate, 'missing_model_api_key'))
      continue
    }
    const reservationResult = await reserveCandidateAttempt?.(candidate)
    if (reservationResult && !reservationResult.ok) {
      failures.push(toTargetFailure(candidate, reservationResult.error))
      continue
    }
    const reservation: AiPlayerRuntimeProposalBudgetReservation | null = reservationResult?.ok
      ? {
          reservationId: reservationResult.reservationId,
          budgetWindowKey: reservationResult.budgetWindowKey,
          limitMode: reservationResult.limitMode,
        }
      : null
    let result: ModelProposalResult
    try {
      result = await requestAiPlayerRuntimeProposalFromModel({
        target: candidate.target,
        observation,
        fetchImpl,
      })
    } catch {
      result = {
        ok: false,
        error: 'model_request_failed_exception',
      }
    }
    await commitCandidateAttempt?.(candidate, result, reservation)
    if (result.ok) {
      return {
        ...result,
        selectedProvider: toSelectedProvider(candidate),
        providerFallbackFailures: failures,
        budgetReservationId: reservation?.reservationId,
        budgetWindowKey: reservation?.budgetWindowKey,
      }
    }
    failures.push(toTargetFailure(candidate, result.error))
  }

  return {
    ok: false,
    error: failures.find((failure) => failure.error.startsWith('provider_budget_'))?.error
      ?? failures[failures.length - 1]?.error
      ?? 'missing_model_target',
    providerFallbackFailures: failures,
  }
}
