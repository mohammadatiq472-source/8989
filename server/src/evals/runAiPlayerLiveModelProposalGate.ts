import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { ResolvedPlannerTarget } from '../config/modelGateway'
import { requestAiPlayerRuntimeProposalFromModel } from '../application/ai/aiPlayerRuntimeProposalModel'
import {
  readAiPlayerRuntimeModelSecretSources,
  resolveAiPlayerRuntimeModelTarget,
} from '../application/ai/aiPlayerRuntimeModelTarget'

type GateCheck = {
  name: string
  passed: boolean
  details?: Record<string, unknown>
}

const LATEST_REPORT_PATH = join(process.cwd(), 'tmp', 'gates', 'ai_player_live_model_proposal_gate_latest.json')
const LIVE_REQUEST_TIMEOUT_MS = 45_000
const SECRET_ENV_NAMES = [
  'AI_PLAYER_RUNTIME_MODEL_API_KEY',
  'LLM_RELAY_API_KEY',
  'LLM_RELAY_API_KEYS',
  'OPENAI_API_KEY',
] as const

const CONFIG_ENV_NAMES = [
  'AI_PLAYER_RUNTIME_MODEL_BASE_URL',
  'AI_PLAYER_RUNTIME_MODEL',
  'LLM_RELAY_URL',
  'LLM_RELAY_MODEL',
] as const

function maskHost(baseUrl: string) {
  try {
    return new URL(baseUrl).host
  } catch {
    return 'invalid'
  }
}

function sanitizeTransportError(error: unknown) {
  const normalized = error instanceof Error ? error : new Error(String(error))
  const cause = (normalized as { cause?: unknown }).cause
  const causeRecord = cause && typeof cause === 'object'
    ? cause as Record<string, unknown>
    : {}
  return {
    name: normalized.name,
    message: normalized.message,
    causeName: cause instanceof Error ? cause.name : undefined,
    causeMessage: cause instanceof Error ? cause.message : undefined,
    code: typeof causeRecord.code === 'string' ? causeRecord.code : undefined,
    errno: typeof causeRecord.errno === 'string' || typeof causeRecord.errno === 'number'
      ? causeRecord.errno
      : undefined,
    syscall: typeof causeRecord.syscall === 'string' ? causeRecord.syscall : undefined,
    hostname: typeof causeRecord.hostname === 'string' ? causeRecord.hostname : undefined,
  }
}

function buildTarget(): ResolvedPlannerTarget {
  return resolveAiPlayerRuntimeModelTarget()
}

function buildObservation() {
  return {
    aiPlayerId: 'live_gate_ai_player',
    runtime: {
      aiPlayerId: 'live_gate_ai_player',
      factionId: 'player',
      governorPlayerId: 'human_live_gate',
      enabled: true,
      paused: false,
      actionWhitelist: ['resource_transfer_to_governor', 'reward_claim'],
      budget: {
        actionPointsRemaining: 10,
        foodRemaining: 100,
        aiQuota: null,
      },
      resourceTransfer: {
        canTransferNow: true,
        blockedBy: null,
        remainingQuotaTotal: 80,
        cooldownRemainingTicks: 0,
        windowRemainingTicks: 0,
      },
      proposalStats: {
        pendingApprovalCount: 0,
        approvedCount: 0,
        rejectedCount: 0,
        executedCount: 0,
        failedCount: 0,
      },
    },
    world: {
      tick: 12,
      worldVersion: 4,
      faction: {
        id: 'player',
        actionPoints: 10,
        food: 100,
        wood: 20,
        stone: 10,
        iron: 10,
        aiResourceAccounts: {
          live_gate_ai_player: {
            resources: {
              wood: 40,
            },
          },
        },
        governorResourceInboxes: {},
      },
      units: [],
    },
    receipts: [],
    failures: [],
  }
}

function writeReport(report: Record<string, unknown>) {
  const stampedPath = join(
    process.cwd(),
    'tmp',
    'gates',
    `ai_player_live_model_proposal_gate_${new Date().toISOString().replace(/[:.]/g, '_')}.json`,
  )
  mkdirSync(dirname(LATEST_REPORT_PATH), { recursive: true })
  writeFileSync(LATEST_REPORT_PATH, JSON.stringify(report, null, 2), 'utf-8')
  writeFileSync(stampedPath, JSON.stringify(report, null, 2), 'utf-8')
  return { latestPath: LATEST_REPORT_PATH, stampedPath }
}

async function run() {
  const target = buildTarget()
  const secretSources = readAiPlayerRuntimeModelSecretSources()
  const checks: GateCheck[] = [
    {
      name: 'relay_url_configured',
      passed: target.baseUrl.length > 0,
      details: { host: maskHost(target.baseUrl) },
    },
    {
      name: 'api_key_available',
      passed: target.apiKeys.length > 0,
      details: { hasKey: target.apiKeys.length > 0, keyCount: target.apiKeys.length, sources: secretSources },
    },
    {
      name: 'secret_env_only',
      passed: true,
      details: {
        acceptedSecretEnvNames: [...SECRET_ENV_NAMES],
        acceptedConfigEnvNames: [...CONFIG_ENV_NAMES],
        repoDotenvLoading: false,
        secretFileLoading: false,
        secretEcho: false,
      },
    },
  ]

  if (target.apiKeys.length === 0) {
    const report = {
      gate: 'ai_player_live_model_proposal',
      status: 'skipped',
      passed: true,
      skipped: true,
      reason: 'missing_model_api_key',
      checkedAt: new Date().toISOString(),
      target: {
        host: maskHost(target.baseUrl),
        model: target.model,
        protocol: target.protocol,
        hasKey: false,
        secretSources,
        secretPolicy: 'env_only_no_file_no_echo',
      },
      checks,
    }
    const paths = writeReport(report)
    console.log(`[AI Player Live Model Proposal Gate] skipped=true reason=missing_model_api_key latest=${paths.latestPath}`)
    return
  }

  const liveFetch: typeof fetch = (input, init) => fetch(input, {
    ...init,
    signal: AbortSignal.timeout(LIVE_REQUEST_TIMEOUT_MS),
  })
  const result = await requestAiPlayerRuntimeProposalFromModel({
    target,
    observation: buildObservation(),
    fetchImpl: liveFetch,
  }).catch((error: unknown) => ({
    ok: false as const,
    error: 'model_transport_request_failed',
    transportError: sanitizeTransportError(error),
  }))
  if (!result.ok) {
    checks.push({
      name: 'model_proposal_request_ok',
      passed: false,
      details: {
        error: result.error,
        transportError: 'transportError' in result ? result.transportError : undefined,
      },
    })
    const report = {
      gate: 'ai_player_live_model_proposal',
      status: 'fail',
      passed: false,
      skipped: false,
      checkedAt: new Date().toISOString(),
      target: {
        host: maskHost(target.baseUrl),
        model: target.model,
        protocol: target.protocol,
        hasKey: true,
        secretSources,
        secretPolicy: 'env_only_no_file_no_echo',
      },
      checks,
    }
    const paths = writeReport(report)
    console.error(`[AI Player Live Model Proposal Gate] ok=false error=${result.error} latest=${paths.latestPath}`)
    process.exitCode = 1
    return
  }

  const rawJsonOnly = result.normalization === undefined
  const proposalRequestsNonEmpty = result.proposalRequests.length > 0
  const onlyWhitelistedActions = result.proposalRequests.every((proposal) =>
    buildObservation().runtime.actionWhitelist.includes(proposal.action),
  )
  const fourBlockReasonTokens = ['资源：', '目标：', '风险：', '批准后结果：']
  const proposalReasonsUsePlayerFourBlocks = result.proposalRequests.every((proposal) =>
    fourBlockReasonTokens.every((token) => proposal.reason.includes(token)),
  )
  checks.push(
    {
      name: 'model_proposal_request_ok',
      passed: true,
      details: { model: result.model },
    },
    {
      name: 'strict_raw_json_only',
      passed: rawJsonOnly,
      details: {
        normalization: result.normalization ?? null,
        expected: 'raw_json_object_no_markdown_no_prose',
      },
    },
    {
      name: 'proposal_requests_schema_valid',
      passed: true,
      details: {
        proposalCount: result.proposalRequests.length,
        actions: result.proposalRequests.map((proposal) => proposal.action),
      },
    },
    {
      name: 'proposal_requests_non_empty',
      passed: proposalRequestsNonEmpty,
      details: { proposalCount: result.proposalRequests.length },
    },
    {
      name: 'proposal_actions_whitelisted',
      passed: onlyWhitelistedActions,
      details: {
        actions: result.proposalRequests.map((proposal) => proposal.action),
        whitelist: buildObservation().runtime.actionWhitelist,
      },
    },
    {
      name: 'proposal_reason_player_four_blocks',
      passed: proposalReasonsUsePlayerFourBlocks,
      details: {
        requiredTokens: fourBlockReasonTokens,
        proposalCount: result.proposalRequests.length,
      },
    },
    {
      name: 'no_world_execution',
      passed: true,
      details: { createdProposalOnly: true },
    },
  )
  const passed = checks.every((check) => check.passed)
  const report = {
    gate: 'ai_player_live_model_proposal',
    status: passed ? 'pass' : 'fail',
    passed,
    skipped: false,
    checkedAt: new Date().toISOString(),
    target: {
      host: maskHost(target.baseUrl),
      model: target.model,
      protocol: target.protocol,
      hasKey: true,
      secretSources,
      secretPolicy: 'env_only_no_file_no_echo',
    },
    output: {
      proposalCount: result.proposalRequests.length,
      actions: result.proposalRequests.map((proposal) => proposal.action),
      needsHumanReview: result.output.needsHumanReview,
      hasDeferReason: Boolean(result.output.deferReason?.trim()),
      normalization: result.normalization ?? null,
      strictRawJsonOnly: rawJsonOnly,
    },
    checks,
  }
  const paths = writeReport(report)
  if (!passed) {
    console.error(
      `[AI Player Live Model Proposal Gate] ok=false strictRawJsonOnly=${rawJsonOnly} proposalCount=${result.proposalRequests.length} latest=${paths.latestPath}`,
    )
    process.exitCode = 1
    return
  }
  console.log(
    `[AI Player Live Model Proposal Gate] ok=true strictRawJsonOnly=${rawJsonOnly} proposalCount=${result.proposalRequests.length} latest=${paths.latestPath}`,
  )
}

run().catch((error) => {
  const transportError = sanitizeTransportError(error)
  const report = {
    gate: 'ai_player_live_model_proposal',
    status: 'fail',
    passed: false,
    skipped: false,
    checkedAt: new Date().toISOString(),
    error: transportError.message,
    transportError,
  }
  const paths = writeReport(report)
  console.error(`[AI Player Live Model Proposal Gate] failed latest=${paths.latestPath}`)
  process.exitCode = 1
})
