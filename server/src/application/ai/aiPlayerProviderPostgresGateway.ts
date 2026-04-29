import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import {
  aiPlayerProviderAuditEventSchema,
  aiPlayerProviderBillingLedgerEntrySchema,
} from '../../../../shared/schemas/aiPlayerProviderAccount'

type QueryResultLike<T extends Record<string, unknown> = Record<string, unknown>> = {
  rows: T[]
  rowCount: number | null
}

export type PgClientLike = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryResultLike<T>>
  release(): void
}

export type PgPoolLike = {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    text: string,
    params?: readonly unknown[],
  ): Promise<QueryResultLike<T>>
  connect(): Promise<PgClientLike>
}

type ProviderIngestPayload = {
  schemaVersion: 1
  source: 'ai-player-provider-account-store'
  sentAt: string
  billingLedgerEntries: unknown[]
  auditEvents: unknown[]
}

type ProviderBudgetGatePayload = {
  schemaVersion: 1
  source: 'ai-player-provider-account-store'
  operation: 'reserve' | 'commit' | 'release'
  sentAt: string
  reservationId?: string
  reserve?: Record<string, unknown>
  commit?: Record<string, unknown>
}

type BudgetLimits = {
  limitMode: 'unlimited' | 'configured' | 'disabled'
  maxRuns: number | null
  maxPromptTokens: number | null
  maxCompletionTokens: number | null
  maxTotalTokens: number | null
  maxEstimatedCostUsd: number | null
}

type GatewayOptions = {
  ledgerAuditHmacSecret?: string
  budgetGateHmacSecret?: string
  maxBodyBytes?: number
}

type GatewayStore = {
  health(): Promise<Record<string, unknown>>
  ingestLedgerAudit(input: {
    payload: ProviderIngestPayload
    idempotencyKey: string
    requestHash: string
  }): Promise<Record<string, unknown>>
  reserveBudget(input: {
    payload: ProviderBudgetGatePayload
    idempotencyKey: string
    requestHash: string
  }): Promise<Record<string, unknown>>
  commitBudget(input: {
    payload: ProviderBudgetGatePayload
    idempotencyKey: string
    requestHash: string
  }): Promise<Record<string, unknown>>
  releaseBudget(input: {
    payload: ProviderBudgetGatePayload
    idempotencyKey: string
    requestHash: string
  }): Promise<Record<string, unknown>>
}

const DEFAULT_MAX_BODY_BYTES = 1_048_576
const MAX_IDEMPOTENCY_KEY_LENGTH = 160
export const AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_MIGRATION_ID = '2026_04_28_ai_player_provider_gateway_v1'

export const AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS ai_provider_gateway_schema_migrations (
  migration_id text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_provider_gateway_idempotency (
  idempotency_key text PRIMARY KEY,
  route text NOT NULL,
  request_hash text NOT NULL,
  status text NOT NULL DEFAULT 'in_progress',
  response_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ai_provider_billing_ledger (
  ledger_entry_id text PRIMARY KEY,
  request_id text NOT NULL,
  ai_player_id text NOT NULL,
  faction_id text NOT NULL,
  governor_player_id text NOT NULL,
  billing_account_type text NOT NULL,
  billing_account_id text,
  provider_source text NOT NULL,
  byok_source text NOT NULL,
  model text NOT NULL,
  provider text NOT NULL,
  budget_tier text NOT NULL,
  budget_window_key text,
  budget_reservation_id text,
  usage jsonb NOT NULL DEFAULT '{}'::jsonb,
  queue_run_id text,
  idempotency_key text,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_billing_account_created
  ON ai_provider_billing_ledger (billing_account_type, billing_account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_provider_billing_request
  ON ai_provider_billing_ledger (request_id);

CREATE TABLE IF NOT EXISTS ai_provider_audit_events (
  event_id text PRIMARY KEY,
  event_type text NOT NULL,
  request_id text,
  ai_player_id text,
  faction_id text,
  governor_player_id text,
  owner_player_id text,
  actor_id text,
  provider_source text,
  byok_source text,
  model text,
  provider text,
  key_fingerprint text,
  reason text,
  queue_run_id text,
  idempotency_key text,
  metadata jsonb,
  created_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_audit_created
  ON ai_provider_audit_events (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_provider_audit_request
  ON ai_provider_audit_events (request_id);

CREATE TABLE IF NOT EXISTS ai_provider_budget_windows (
  budget_window_key text PRIMARY KEY,
  billing_account_type text NOT NULL,
  billing_account_id text,
  budget_tier text NOT NULL,
  window_started_at timestamptz NOT NULL,
  window_ends_at timestamptz NOT NULL,
  limit_mode text NOT NULL,
  max_runs integer,
  max_prompt_tokens integer,
  max_completion_tokens integer,
  max_total_tokens integer,
  max_estimated_cost_usd numeric,
  reserved_runs integer NOT NULL DEFAULT 0,
  consumed_runs integer NOT NULL DEFAULT 0,
  denied_runs integer NOT NULL DEFAULT 0,
  consumed_prompt_tokens numeric NOT NULL DEFAULT 0,
  consumed_completion_tokens numeric NOT NULL DEFAULT 0,
  consumed_total_tokens numeric NOT NULL DEFAULT 0,
  consumed_estimated_cost_usd numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_budget_account_window
  ON ai_provider_budget_windows (billing_account_type, billing_account_id, budget_tier, window_started_at DESC);

CREATE TABLE IF NOT EXISTS ai_provider_budget_reservations (
  reservation_id text PRIMARY KEY,
  budget_window_key text NOT NULL REFERENCES ai_provider_budget_windows (budget_window_key),
  status text NOT NULL,
  reserved_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  committed_at timestamptz,
  released_at timestamptz,
  ai_player_id text,
  faction_id text NOT NULL,
  governor_player_id text NOT NULL,
  model text NOT NULL,
  provider text NOT NULL,
  provider_source text NOT NULL,
  byok_source text NOT NULL,
  budget_tier text NOT NULL,
  queue_run_id text,
  idempotency_key text,
  usage jsonb,
  error text
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_budget_reservation_window
  ON ai_provider_budget_reservations (budget_window_key, status);
CREATE INDEX IF NOT EXISTS idx_ai_provider_budget_reservation_expiry
  ON ai_provider_budget_reservations (expires_at)
  WHERE status = 'reserved';

INSERT INTO ai_provider_gateway_schema_migrations (migration_id)
VALUES ('${AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_MIGRATION_ID}')
ON CONFLICT (migration_id) DO NOTHING;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_provider_gateway_idempotency_status') THEN
    ALTER TABLE ai_provider_gateway_idempotency
      ADD CONSTRAINT chk_ai_provider_gateway_idempotency_status
      CHECK (status IN ('in_progress', 'completed')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_provider_gateway_idempotency_key_length') THEN
    ALTER TABLE ai_provider_gateway_idempotency
      ADD CONSTRAINT chk_ai_provider_gateway_idempotency_key_length
      CHECK (char_length(idempotency_key) <= 160) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_provider_billing_account_type') THEN
    ALTER TABLE ai_provider_billing_ledger
      ADD CONSTRAINT chk_ai_provider_billing_account_type
      CHECK (billing_account_type IN ('platform', 'faction_byok', 'player_byok')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_provider_billing_source') THEN
    ALTER TABLE ai_provider_billing_ledger
      ADD CONSTRAINT chk_ai_provider_billing_source
      CHECK (provider_source IN ('default', 'env', 'faction_config', 'player_config', 'fallback')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_provider_billing_byok_source') THEN
    ALTER TABLE ai_provider_billing_ledger
      ADD CONSTRAINT chk_ai_provider_billing_byok_source
      CHECK (byok_source IN ('none', 'faction_config', 'player_config')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_provider_billing_budget_tier') THEN
    ALTER TABLE ai_provider_billing_ledger
      ADD CONSTRAINT chk_ai_provider_billing_budget_tier
      CHECK (budget_tier IN ('strict_action', 'economy_chat', 'disabled')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_provider_audit_event_type') THEN
    ALTER TABLE ai_provider_audit_events
      ADD CONSTRAINT chk_ai_provider_audit_event_type
      CHECK (event_type IN (
        'byok_key_configured',
        'byok_key_revoked',
        'provider_request_succeeded',
        'provider_request_failed',
        'provider_fallback_failed'
      )) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_provider_audit_source') THEN
    ALTER TABLE ai_provider_audit_events
      ADD CONSTRAINT chk_ai_provider_audit_source
      CHECK (provider_source IS NULL OR provider_source IN ('default', 'env', 'faction_config', 'player_config', 'fallback')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_provider_audit_byok_source') THEN
    ALTER TABLE ai_provider_audit_events
      ADD CONSTRAINT chk_ai_provider_audit_byok_source
      CHECK (byok_source IS NULL OR byok_source IN ('none', 'faction_config', 'player_config')) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_provider_budget_window_values') THEN
    ALTER TABLE ai_provider_budget_windows
      ADD CONSTRAINT chk_ai_provider_budget_window_values
      CHECK (
        budget_tier IN ('strict_action', 'economy_chat', 'disabled')
        AND limit_mode IN ('unlimited', 'configured', 'disabled')
        AND window_ends_at > window_started_at
        AND (max_runs IS NULL OR max_runs >= 0)
        AND (max_prompt_tokens IS NULL OR max_prompt_tokens >= 0)
        AND (max_completion_tokens IS NULL OR max_completion_tokens >= 0)
        AND (max_total_tokens IS NULL OR max_total_tokens >= 0)
        AND (max_estimated_cost_usd IS NULL OR max_estimated_cost_usd >= 0)
        AND reserved_runs >= 0
        AND consumed_runs >= 0
        AND denied_runs >= 0
        AND consumed_prompt_tokens >= 0
        AND consumed_completion_tokens >= 0
        AND consumed_total_tokens >= 0
        AND consumed_estimated_cost_usd >= 0
      ) NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_ai_provider_budget_reservation_values') THEN
    ALTER TABLE ai_provider_budget_reservations
      ADD CONSTRAINT chk_ai_provider_budget_reservation_values
      CHECK (
        status IN ('reserved', 'committed', 'released', 'expired')
        AND provider_source IN ('default', 'env', 'faction_config', 'player_config', 'fallback')
        AND byok_source IN ('none', 'faction_config', 'player_config')
        AND budget_tier IN ('strict_action', 'economy_chat', 'disabled')
        AND expires_at > reserved_at
      ) NOT VALID;
  END IF;
END $$;
`

function writeJson(res: ServerResponse, statusCode: number, payload: unknown) {
  res.statusCode = statusCode
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.end(JSON.stringify(payload))
}

function readRawBody(req: IncomingMessage, maxBodyBytes: number) {
  return new Promise<string>((resolve, reject) => {
    const chunks: Buffer[] = []
    let total = 0
    let failed = false
    req.on('data', (chunk) => {
      if (failed) {
        return
      }
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      total += buffer.length
      if (total > maxBodyBytes) {
        failed = true
        reject(new Error('request_body_too_large'))
        return
      }
      chunks.push(buffer)
    })
    req.on('end', () => {
      if (!failed) {
        resolve(Buffer.concat(chunks).toString('utf8'))
      }
    })
    req.on('error', reject)
  })
}

function sha256(input: string) {
  return createHash('sha256').update(input, 'utf8').digest('hex')
}

function verifyHmac(
  rawBody: string,
  signature: string | undefined,
  signatureAlg: string | undefined,
  secret: string | undefined,
) {
  if (!secret) {
    return true
  }
  if (signatureAlg?.toLowerCase() !== 'hmac-sha256') {
    return false
  }
  if (!signature) {
    return false
  }
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest('hex')
  const expectedBuffer = Buffer.from(expected, 'hex')
  const actualBuffer = Buffer.from(signature, 'hex')
  return expectedBuffer.length === actualBuffer.length && timingSafeEqual(expectedBuffer, actualBuffer)
}

function parseJsonObject(rawBody: string): Record<string, unknown> {
  let parsed: unknown
  try {
    parsed = JSON.parse(rawBody) as unknown
  } catch {
    throw new Error('invalid_json')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('json_object_required')
  }
  return parsed as Record<string, unknown>
}

function parseIngestPayload(input: Record<string, unknown>): ProviderIngestPayload {
  if (input.schemaVersion !== 1 || input.source !== 'ai-player-provider-account-store') {
    throw new Error('provider_ingest_contract_mismatch')
  }
  const billingLedgerEntries = Array.isArray(input.billingLedgerEntries)
    ? input.billingLedgerEntries.map((entry) => aiPlayerProviderBillingLedgerEntrySchema.parse(entry))
    : []
  const auditEvents = Array.isArray(input.auditEvents)
    ? input.auditEvents.map((event) => aiPlayerProviderAuditEventSchema.parse(event))
    : []
  return {
    schemaVersion: 1,
    source: 'ai-player-provider-account-store',
    sentAt: String(input.sentAt ?? new Date().toISOString()),
    billingLedgerEntries,
    auditEvents,
  }
}

function parseBudgetPayload(input: Record<string, unknown>): ProviderBudgetGatePayload {
  if (input.schemaVersion !== 1 || input.source !== 'ai-player-provider-account-store') {
    throw new Error('provider_budget_gate_contract_mismatch')
  }
  const operation = input.operation === 'reserve' || input.operation === 'commit' || input.operation === 'release'
    ? input.operation
    : null
  if (!operation) {
    throw new Error('budget_gate_operation_required')
  }
  return {
    schemaVersion: 1,
    source: 'ai-player-provider-account-store',
    operation,
    sentAt: String(input.sentAt ?? new Date().toISOString()),
    reservationId: typeof input.reservationId === 'string' ? input.reservationId : undefined,
    reserve: input.reserve && typeof input.reserve === 'object' && !Array.isArray(input.reserve)
      ? input.reserve as Record<string, unknown>
      : undefined,
    commit: input.commit && typeof input.commit === 'object' && !Array.isArray(input.commit)
      ? input.commit as Record<string, unknown>
      : undefined,
  }
}

function requireString(input: Record<string, unknown>, key: string): string {
  const value = input[key]
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`${key}_required`)
  }
  return value.trim()
}

function optionalString(input: Record<string, unknown>, key: string): string | null {
  const value = input[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

function readNumberValue(input: unknown): number | null {
  if (input === null || input === undefined || input === '') {
    return null
  }
  const parsed = Number(input)
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null
}

function readIntegerValue(input: unknown): number | null {
  const parsed = readNumberValue(input)
  return parsed === null ? null : Math.trunc(parsed)
}

function readEnvInteger(primary: string, fallback: string): number | null {
  return readIntegerValue(process.env[primary] ?? process.env[fallback])
}

function readEnvNumber(primary: string, fallback: string): number | null {
  return readNumberValue(process.env[primary] ?? process.env[fallback])
}

function resolveBudgetLimits(reserve: Record<string, unknown>): BudgetLimits {
  const localLimitMode = reserve.localLimitMode === 'configured' || reserve.localLimitMode === 'disabled'
    ? reserve.localLimitMode
    : 'unlimited'
  const maxRuns = readIntegerValue(reserve.maxRuns)
    ?? readEnvInteger('AI_PLAYER_PROVIDER_GATEWAY_BUDGET_MAX_RUNS_PER_WINDOW', 'AI_PLAYER_PROVIDER_BUDGET_MAX_RUNS_PER_WINDOW')
  const maxPromptTokens = readIntegerValue(reserve.maxPromptTokens)
    ?? readEnvInteger('AI_PLAYER_PROVIDER_GATEWAY_BUDGET_MAX_PROMPT_TOKENS_PER_WINDOW', 'AI_PLAYER_PROVIDER_BUDGET_MAX_PROMPT_TOKENS_PER_WINDOW')
  const maxCompletionTokens = readIntegerValue(reserve.maxCompletionTokens)
    ?? readEnvInteger('AI_PLAYER_PROVIDER_GATEWAY_BUDGET_MAX_COMPLETION_TOKENS_PER_WINDOW', 'AI_PLAYER_PROVIDER_BUDGET_MAX_COMPLETION_TOKENS_PER_WINDOW')
  const maxTotalTokens = readIntegerValue(reserve.maxTotalTokens)
    ?? readEnvInteger('AI_PLAYER_PROVIDER_GATEWAY_BUDGET_MAX_TOTAL_TOKENS_PER_WINDOW', 'AI_PLAYER_PROVIDER_BUDGET_MAX_TOTAL_TOKENS_PER_WINDOW')
  const maxEstimatedCostUsd = readNumberValue(reserve.maxEstimatedCostUsd)
    ?? readEnvNumber('AI_PLAYER_PROVIDER_GATEWAY_BUDGET_MAX_COST_USD_PER_WINDOW', 'AI_PLAYER_PROVIDER_BUDGET_MAX_COST_USD_PER_WINDOW')
  const configured = maxRuns !== null
    || maxPromptTokens !== null
    || maxCompletionTokens !== null
    || maxTotalTokens !== null
    || maxEstimatedCostUsd !== null
  return {
    limitMode: localLimitMode === 'disabled' ? 'disabled' : (configured ? 'configured' : localLimitMode),
    maxRuns,
    maxPromptTokens,
    maxCompletionTokens,
    maxTotalTokens,
    maxEstimatedCostUsd,
  }
}

async function withTransaction<T>(pool: PgPoolLike, work: (client: PgClientLike) => Promise<T>): Promise<T> {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    const result = await work(client)
    await client.query('COMMIT')
    return result
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined)
    throw error
  } finally {
    client.release()
  }
}

async function beginIdempotentRequest(
  client: PgClientLike,
  route: string,
  idempotencyKey: string,
  requestHash: string,
): Promise<Record<string, unknown> | null> {
  const inserted = await client.query(
    `INSERT INTO ai_provider_gateway_idempotency (idempotency_key, route, request_hash, status)
     VALUES ($1, $2, $3, 'in_progress')
     ON CONFLICT (idempotency_key) DO NOTHING
     RETURNING response_json`,
    [idempotencyKey, route, requestHash],
  )
  if ((inserted.rowCount ?? 0) > 0) {
    return null
  }
  const existing = await client.query<{
    route: string
    request_hash: string
    response_json: Record<string, unknown> | null
  }>(
    'SELECT route, request_hash, response_json FROM ai_provider_gateway_idempotency WHERE idempotency_key = $1 FOR UPDATE',
    [idempotencyKey],
  )
  const row = existing.rows[0]
  if (!row) {
    throw new Error('idempotency_key_conflict_missing_row')
  }
  if (row.route !== route) {
    throw new Error('idempotency_key_reused_for_different_route')
  }
  if (row.request_hash !== requestHash) {
    throw new Error('idempotency_key_reused_with_different_payload')
  }
  if (!row.response_json) {
    throw new Error('idempotency_key_in_progress')
  }
  return { ...row.response_json, deduped: true }
}

async function finishIdempotentRequest(
  client: PgClientLike,
  idempotencyKey: string,
  response: Record<string, unknown>,
) {
  await client.query(
    `UPDATE ai_provider_gateway_idempotency
     SET status = 'completed', response_json = $2::jsonb, updated_at = now()
     WHERE idempotency_key = $1`,
    [idempotencyKey, JSON.stringify(response)],
  )
}

function toWindowResponse(row: Record<string, unknown>) {
  return {
    budgetWindowKey: String(row.budget_window_key),
    billingAccountType: String(row.billing_account_type),
    billingAccountId: row.billing_account_id === null ? null : String(row.billing_account_id),
    budgetTier: String(row.budget_tier),
    windowStartedAt: new Date(String(row.window_started_at)).toISOString(),
    windowEndsAt: new Date(String(row.window_ends_at)).toISOString(),
    limitMode: String(row.limit_mode),
    maxRuns: row.max_runs === null ? null : Number(row.max_runs),
    maxPromptTokens: row.max_prompt_tokens === null ? null : Number(row.max_prompt_tokens),
    maxCompletionTokens: row.max_completion_tokens === null ? null : Number(row.max_completion_tokens),
    maxTotalTokens: row.max_total_tokens === null ? null : Number(row.max_total_tokens),
    maxEstimatedCostUsd: row.max_estimated_cost_usd === null ? null : Number(row.max_estimated_cost_usd),
    reservedRuns: Number(row.reserved_runs ?? 0),
    consumedRuns: Number(row.consumed_runs ?? 0),
    deniedRuns: Number(row.denied_runs ?? 0),
    consumedPromptTokens: Number(row.consumed_prompt_tokens ?? 0),
    consumedCompletionTokens: Number(row.consumed_completion_tokens ?? 0),
    consumedTotalTokens: Number(row.consumed_total_tokens ?? 0),
    consumedEstimatedCostUsd: Number(row.consumed_estimated_cost_usd ?? 0),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
  }
}

function budgetExhausted(window: Record<string, unknown>) {
  const reservedRuns = Number(window.reserved_runs ?? 0)
  const consumedRuns = Number(window.consumed_runs ?? 0)
  const maxRuns = window.max_runs === null ? null : Number(window.max_runs)
  const maxPromptTokens = window.max_prompt_tokens === null ? null : Number(window.max_prompt_tokens)
  const maxCompletionTokens = window.max_completion_tokens === null ? null : Number(window.max_completion_tokens)
  const maxTotalTokens = window.max_total_tokens === null ? null : Number(window.max_total_tokens)
  const maxCost = window.max_estimated_cost_usd === null ? null : Number(window.max_estimated_cost_usd)
  return String(window.limit_mode) === 'disabled'
    || (maxRuns !== null && reservedRuns + consumedRuns >= maxRuns)
    || (maxPromptTokens !== null && Number(window.consumed_prompt_tokens ?? 0) >= maxPromptTokens)
    || (maxCompletionTokens !== null && Number(window.consumed_completion_tokens ?? 0) >= maxCompletionTokens)
    || (maxTotalTokens !== null && Number(window.consumed_total_tokens ?? 0) >= maxTotalTokens)
    || (maxCost !== null && Number(window.consumed_estimated_cost_usd ?? 0) >= maxCost)
}

function readUsage(commit: Record<string, unknown> | undefined) {
  const usage = commit?.usage && typeof commit.usage === 'object' && !Array.isArray(commit.usage)
    ? commit.usage as Record<string, unknown>
    : {}
  const promptTokens = readNumberValue(usage.promptTokens) ?? readNumberValue(usage.prompt_tokens) ?? 0
  const completionTokens = readNumberValue(usage.completionTokens) ?? readNumberValue(usage.completion_tokens) ?? 0
  const totalTokens = readNumberValue(usage.totalTokens) ?? readNumberValue(usage.total_tokens) ?? (promptTokens + completionTokens)
  const estimatedCostUsd = readNumberValue(usage.estimatedCostUsd) ?? readNumberValue(usage.estimated_cost_usd) ?? 0
  return { promptTokens, completionTokens, totalTokens, estimatedCostUsd }
}

function classifyGatewayError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error)
  const name = error instanceof Error ? error.name : ''
  if (message === 'request_body_too_large') {
    return { statusCode: 413, message }
  }
  if (
    message === 'invalid_json'
    || message === 'json_object_required'
    || message === 'provider_ingest_contract_mismatch'
    || message === 'provider_budget_gate_contract_mismatch'
    || message === 'budget_gate_operation_required'
    || message.endsWith('_required')
    || name === 'ZodError'
  ) {
    return { statusCode: 400, message }
  }
  if (
    message.startsWith('idempotency_key_reused_')
    || message === 'idempotency_key_in_progress'
    || message === 'budget_reservation_id_conflict'
    || message === 'budget_reservation_not_found'
  ) {
    return { statusCode: 409, message }
  }
  return { statusCode: 500, message }
}

async function expireBudgetReservations(client: PgClientLike, budgetWindowKey: string) {
  await client.query(
    `WITH expired AS (
       UPDATE ai_provider_budget_reservations
       SET status = 'expired',
           released_at = now(),
           error = COALESCE(error, 'reservation_expired')
       WHERE budget_window_key = $1
         AND status = 'reserved'
         AND expires_at <= now()
       RETURNING reservation_id
     )
     UPDATE ai_provider_budget_windows
     SET reserved_runs = GREATEST(0, reserved_runs - (SELECT count(*) FROM expired)),
         updated_at = CASE WHEN (SELECT count(*) FROM expired) > 0 THEN now() ELSE updated_at END
     WHERE budget_window_key = $1`,
    [budgetWindowKey],
  )
}

export async function applyAiPlayerProviderPostgresGatewayMigration(pool: PgPoolLike): Promise<void> {
  await pool.query(AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_MIGRATION_SQL)
}

export class AiPlayerProviderPostgresGatewayStore implements GatewayStore {
  readonly #pool: PgPoolLike

  constructor(pool: PgPoolLike) {
    this.#pool = pool
  }

  async health(): Promise<Record<string, unknown>> {
    let databaseReachable = false
    try {
      const result = await this.#pool.query<{ ok: number }>('SELECT 1::int AS ok')
      databaseReachable = result.rows[0]?.ok === 1
      const migration = await this.#pool.query<{ migration_applied: boolean }>(
        `SELECT EXISTS (
           SELECT 1
           FROM ai_provider_gateway_schema_migrations
           WHERE migration_id = $1
         ) AS migration_applied`,
        [AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_MIGRATION_ID],
      )
      const migrationApplied = migration.rows[0]?.migration_applied === true
      return {
        ok: databaseReachable && migrationApplied,
        backend: 'postgres',
        databaseReachable,
        migrationApplied,
        migrationId: AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_MIGRATION_ID,
      }
    } catch (error) {
      return {
        ok: false,
        backend: 'postgres',
        databaseReachable,
        migrationApplied: false,
        migrationId: AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_MIGRATION_ID,
        error: error instanceof Error ? error.message : String(error),
      }
    }
  }

  async ingestLedgerAudit(input: {
    payload: ProviderIngestPayload
    idempotencyKey: string
    requestHash: string
  }): Promise<Record<string, unknown>> {
    return await withTransaction(this.#pool, async (client) => {
      const cached = await beginIdempotentRequest(client, 'ingest', input.idempotencyKey, input.requestHash)
      if (cached) return cached
      let ledgerInserted = 0
      let auditInserted = 0
      for (const entry of input.payload.billingLedgerEntries) {
        const parsed = aiPlayerProviderBillingLedgerEntrySchema.parse(entry)
        const result = await client.query(
          `INSERT INTO ai_provider_billing_ledger (
            ledger_entry_id, request_id, ai_player_id, faction_id, governor_player_id,
            billing_account_type, billing_account_id, provider_source, byok_source,
            model, provider, budget_tier, budget_window_key, budget_reservation_id,
            usage, queue_run_id, idempotency_key, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
            $15::jsonb, $16, $17, $18
          ) ON CONFLICT (ledger_entry_id) DO NOTHING`,
          [
            parsed.ledgerEntryId,
            parsed.requestId,
            parsed.aiPlayerId,
            parsed.factionId,
            parsed.governorPlayerId,
            parsed.billingAccountType,
            parsed.billingAccountId,
            parsed.providerSource,
            parsed.byokSource,
            parsed.model,
            parsed.provider,
            parsed.budgetTier,
            parsed.budgetWindowKey ?? null,
            parsed.budgetReservationId ?? null,
            JSON.stringify(parsed.usage),
            parsed.queueRunId ?? null,
            parsed.idempotencyKey ?? null,
            parsed.createdAt,
          ],
        )
        ledgerInserted += result.rowCount ?? 0
      }
      for (const event of input.payload.auditEvents) {
        const parsed = aiPlayerProviderAuditEventSchema.parse(event)
        const result = await client.query(
          `INSERT INTO ai_provider_audit_events (
            event_id, event_type, request_id, ai_player_id, faction_id, governor_player_id,
            owner_player_id, actor_id, provider_source, byok_source, model, provider,
            key_fingerprint, reason, queue_run_id, idempotency_key, metadata, created_at
          ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,
            $13, $14, $15, $16, $17::jsonb, $18
          ) ON CONFLICT (event_id) DO NOTHING`,
          [
            parsed.eventId,
            parsed.eventType,
            parsed.requestId ?? null,
            parsed.aiPlayerId ?? null,
            parsed.factionId ?? null,
            parsed.governorPlayerId ?? null,
            parsed.ownerPlayerId ?? null,
            parsed.actorId ?? null,
            parsed.providerSource ?? null,
            parsed.byokSource ?? null,
            parsed.model ?? null,
            parsed.provider ?? null,
            parsed.keyFingerprint ?? null,
            parsed.reason ?? null,
            parsed.queueRunId ?? null,
            parsed.idempotencyKey ?? null,
            JSON.stringify(parsed.metadata ?? null),
            parsed.createdAt,
          ],
        )
        auditInserted += result.rowCount ?? 0
      }
      const response = { ok: true, ledgerInserted, auditInserted }
      await finishIdempotentRequest(client, input.idempotencyKey, response)
      return response
    })
  }

  async reserveBudget(input: {
    payload: ProviderBudgetGatePayload
    idempotencyKey: string
    requestHash: string
  }): Promise<Record<string, unknown>> {
    const reserve = input.payload.reserve
    if (!reserve) throw new Error('reserve_payload_required')
    return await withTransaction(this.#pool, async (client) => {
      const cached = await beginIdempotentRequest(client, 'budget-gate:reserve', input.idempotencyKey, input.requestHash)
      if (cached) return cached
      const limits = resolveBudgetLimits(reserve)
      const budgetWindowKey = requireString(reserve, 'budgetWindowKey')
      const reservationId = input.payload.reservationId ?? `budget_res_pg_${Date.now()}`
      await client.query(
        `INSERT INTO ai_provider_budget_windows (
          budget_window_key, billing_account_type, billing_account_id, budget_tier,
          window_started_at, window_ends_at, limit_mode, max_runs, max_prompt_tokens,
          max_completion_tokens, max_total_tokens, max_estimated_cost_usd, updated_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now()
        ) ON CONFLICT (budget_window_key) DO UPDATE SET
          limit_mode = EXCLUDED.limit_mode,
          max_runs = EXCLUDED.max_runs,
          max_prompt_tokens = EXCLUDED.max_prompt_tokens,
          max_completion_tokens = EXCLUDED.max_completion_tokens,
          max_total_tokens = EXCLUDED.max_total_tokens,
          max_estimated_cost_usd = EXCLUDED.max_estimated_cost_usd,
          updated_at = now()`,
        [
          budgetWindowKey,
          requireString(reserve, 'billingAccountType'),
          optionalString(reserve, 'billingAccountId'),
          requireString(reserve, 'budgetTier'),
          requireString(reserve, 'windowStartedAt'),
          requireString(reserve, 'windowEndsAt'),
          limits.limitMode,
          limits.maxRuns,
          limits.maxPromptTokens,
          limits.maxCompletionTokens,
          limits.maxTotalTokens,
          limits.maxEstimatedCostUsd,
        ],
      )
      await expireBudgetReservations(client, budgetWindowKey)
      const windowResult = await client.query(
        'SELECT * FROM ai_provider_budget_windows WHERE budget_window_key = $1 FOR UPDATE',
        [budgetWindowKey],
      )
      const window = windowResult.rows[0]
      if (!window) throw new Error('budget_window_not_found_after_upsert')
      if (budgetExhausted(window)) {
        const denied = await client.query(
          `UPDATE ai_provider_budget_windows
           SET denied_runs = denied_runs + 1, updated_at = now()
           WHERE budget_window_key = $1
           RETURNING *`,
          [budgetWindowKey],
        )
        const response = {
          ok: false,
          error: String(window.limit_mode) === 'disabled' ? 'provider_budget_disabled' : 'provider_budget_exhausted',
          reservationId,
          budgetWindowKey,
          window: toWindowResponse(denied.rows[0] ?? window),
        }
        await finishIdempotentRequest(client, input.idempotencyKey, response)
        return response
      }
      const updated = await client.query(
        `UPDATE ai_provider_budget_windows
         SET reserved_runs = reserved_runs + 1, updated_at = now()
         WHERE budget_window_key = $1
         RETURNING *`,
        [budgetWindowKey],
      )
      const reservationInsert = await client.query(
        `INSERT INTO ai_provider_budget_reservations (
           reservation_id, budget_window_key, status, reserved_at, expires_at,
           ai_player_id, faction_id, governor_player_id, model, provider,
          provider_source, byok_source, budget_tier, queue_run_id, idempotency_key
        ) VALUES (
          $1, $2, 'reserved', now(), $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13
        ) ON CONFLICT (reservation_id) DO NOTHING
        RETURNING reservation_id`,
        [
          reservationId,
          budgetWindowKey,
          requireString(reserve, 'expiresAt'),
          optionalString(reserve, 'aiPlayerId'),
          requireString(reserve, 'factionId'),
          requireString(reserve, 'governorPlayerId'),
          requireString(reserve, 'model'),
          requireString(reserve, 'provider'),
          requireString(reserve, 'source'),
          requireString(reserve, 'byokSource'),
          requireString(reserve, 'budgetTier'),
          optionalString(reserve, 'queueRunId'),
          optionalString(reserve, 'idempotencyKey'),
        ],
      )
      if ((reservationInsert.rowCount ?? 0) === 0) {
        throw new Error('budget_reservation_id_conflict')
      }
      const response = {
        ok: true,
        reservationId,
        budgetWindowKey,
        window: toWindowResponse(updated.rows[0] ?? window),
      }
      await finishIdempotentRequest(client, input.idempotencyKey, response)
      return response
    })
  }

  async commitBudget(input: {
    payload: ProviderBudgetGatePayload
    idempotencyKey: string
    requestHash: string
  }): Promise<Record<string, unknown>> {
    return await this.finishBudgetReservation('commit', input)
  }

  async releaseBudget(input: {
    payload: ProviderBudgetGatePayload
    idempotencyKey: string
    requestHash: string
  }): Promise<Record<string, unknown>> {
    return await this.finishBudgetReservation('release', input)
  }

  async finishBudgetReservation(
    operation: 'commit' | 'release',
    input: { payload: ProviderBudgetGatePayload; idempotencyKey: string; requestHash: string },
  ): Promise<Record<string, unknown>> {
    const reservationId = input.payload.reservationId
    if (!reservationId) throw new Error('reservationId_required')
    return await withTransaction(this.#pool, async (client) => {
      const cached = await beginIdempotentRequest(client, `budget-gate:${operation}`, input.idempotencyKey, input.requestHash)
      if (cached) return cached
      const reservationResult = await client.query(
        'SELECT * FROM ai_provider_budget_reservations WHERE reservation_id = $1 FOR UPDATE',
        [reservationId],
      )
      const reservation = reservationResult.rows[0]
      if (!reservation) {
        throw new Error('budget_reservation_not_found')
      }
      if (reservation.status !== 'reserved') {
        const response = { ok: true, reservationId, deduped: true, status: String(reservation.status) }
        await finishIdempotentRequest(client, input.idempotencyKey, response)
        return response
      }
      const usage = readUsage(input.payload.commit)
      if (operation === 'commit') {
        await client.query(
          `UPDATE ai_provider_budget_windows SET
             reserved_runs = GREATEST(0, reserved_runs - 1),
             consumed_runs = consumed_runs + 1,
             consumed_prompt_tokens = consumed_prompt_tokens + $2,
             consumed_completion_tokens = consumed_completion_tokens + $3,
             consumed_total_tokens = consumed_total_tokens + $4,
             consumed_estimated_cost_usd = consumed_estimated_cost_usd + $5,
             updated_at = now()
           WHERE budget_window_key = $1`,
          [
            reservation.budget_window_key,
            usage.promptTokens,
            usage.completionTokens,
            usage.totalTokens,
            usage.estimatedCostUsd,
          ],
        )
      } else {
        await client.query(
          `UPDATE ai_provider_budget_windows SET
             reserved_runs = GREATEST(0, reserved_runs - 1),
             updated_at = now()
           WHERE budget_window_key = $1`,
          [reservation.budget_window_key],
        )
      }
      await client.query(
        `UPDATE ai_provider_budget_reservations SET
           status = $2,
           committed_at = CASE WHEN $2 = 'committed' THEN now() ELSE committed_at END,
           released_at = CASE WHEN $2 = 'released' THEN now() ELSE released_at END,
           usage = $3::jsonb,
           error = $4
         WHERE reservation_id = $1`,
        [
          reservationId,
          operation === 'commit' ? 'committed' : 'released',
          operation === 'commit' ? JSON.stringify(usage) : null,
          typeof input.payload.commit?.error === 'string' ? input.payload.commit.error : null,
        ],
      )
      const response = { ok: true, reservationId }
      await finishIdempotentRequest(client, input.idempotencyKey, response)
      return response
    })
  }
}

export function createAiPlayerProviderPostgresGatewayHandler(
  store: GatewayStore,
  options: GatewayOptions = {},
) {
  const maxBodyBytes = options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES
  return async function handleAiPlayerProviderPostgresGateway(
    req: IncomingMessage,
    res: ServerResponse,
  ): Promise<void> {
    try {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1')
      if (req.method === 'GET' && url.pathname === '/health') {
        writeJson(res, 200, await store.health())
        return
      }
      if (req.method !== 'POST' || (url.pathname !== '/ingest' && url.pathname !== '/budget-gate')) {
        writeJson(res, 404, { ok: false, error: 'not_found' })
        return
      }
      const rawBody = await readRawBody(req, maxBodyBytes)
      const idempotencyKey = String(req.headers['x-idempotency-key'] ?? '').trim()
      if (!idempotencyKey) {
        writeJson(res, 400, { ok: false, error: 'idempotency_key_required' })
        return
      }
      if (idempotencyKey.length > MAX_IDEMPOTENCY_KEY_LENGTH) {
        writeJson(res, 400, { ok: false, error: 'idempotency_key_too_long' })
        return
      }
      const signature = typeof req.headers['x-signature'] === 'string' ? req.headers['x-signature'] : undefined
      const signatureAlg = typeof req.headers['x-signature-alg'] === 'string'
        ? req.headers['x-signature-alg']
        : undefined
      const secret = url.pathname === '/ingest' ? options.ledgerAuditHmacSecret : options.budgetGateHmacSecret
      if (!verifyHmac(rawBody, signature, signatureAlg, secret)) {
        writeJson(res, 401, { ok: false, error: 'invalid_signature' })
        return
      }
      const body = parseJsonObject(rawBody)
      const requestHash = sha256(rawBody)
      if (url.pathname === '/ingest') {
        writeJson(res, 200, await store.ingestLedgerAudit({
          payload: parseIngestPayload(body),
          idempotencyKey,
          requestHash,
        }))
        return
      }
      const payload = parseBudgetPayload(body)
      if (payload.operation === 'reserve') {
        writeJson(res, 200, await store.reserveBudget({ payload, idempotencyKey, requestHash }))
        return
      }
      if (payload.operation === 'commit') {
        writeJson(res, 200, await store.commitBudget({ payload, idempotencyKey, requestHash }))
        return
      }
      writeJson(res, 200, await store.releaseBudget({ payload, idempotencyKey, requestHash }))
    } catch (error) {
      const { statusCode, message: errorMessage } = classifyGatewayError(error)
      writeJson(res, statusCode, {
        ok: false,
        error: errorMessage,
      })
    }
  }
}
