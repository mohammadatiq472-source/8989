import { createServer } from 'node:http'
import pg from 'pg'
import {
  AiPlayerProviderPostgresGatewayStore,
  applyAiPlayerProviderPostgresGatewayMigration,
  createAiPlayerProviderPostgresGatewayHandler,
} from '../application/ai/aiPlayerProviderPostgresGateway'

const DATABASE_URL_ENV = 'AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_DATABASE_URL'
const HOST_ENV = 'AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_HOST'
const PORT_ENV = 'AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_PORT'
const AUTO_MIGRATE_ENV = 'AI_PLAYER_PROVIDER_POSTGRES_GATEWAY_AUTO_MIGRATE'
const LEDGER_AUDIT_HMAC_SECRET_ENV = 'AI_PLAYER_PROVIDER_LEDGER_AUDIT_DB_HMAC_SECRET'
const BUDGET_GATE_HMAC_SECRET_ENV = 'AI_PLAYER_PROVIDER_BUDGET_GATE_HMAC_SECRET'

function usage() {
  return [
    'Usage:',
    '  tsx server/src/evals/runAiPlayerProviderPostgresGateway.ts --migrate',
    '  tsx server/src/evals/runAiPlayerProviderPostgresGateway.ts --serve',
  ].join('\n')
}

function readDatabaseUrl() {
  const value = process.env[DATABASE_URL_ENV]?.trim() || process.env.DATABASE_URL?.trim()
  if (!value) {
    throw new Error(`${DATABASE_URL_ENV} or DATABASE_URL is required`)
  }
  return value
}

function readPort() {
  const value = process.env[PORT_ENV]?.trim() || process.env.PORT?.trim() || '8789'
  const parsed = Number(value)
  if (!Number.isInteger(parsed) || parsed <= 0 || parsed > 65_535) {
    throw new Error(`${PORT_ENV} must be a valid TCP port`)
  }
  return parsed
}

function readHost() {
  return process.env[HOST_ENV]?.trim() || process.env.HOST?.trim() || '127.0.0.1'
}

function shouldAutoMigrate() {
  return process.env[AUTO_MIGRATE_ENV]?.trim() === '1'
}

async function run() {
  const command = process.argv.slice(2).find((item) => item === '--migrate' || item === '--serve')
  if (!command) {
    throw new Error(usage())
  }

  const pool = new pg.Pool({
    connectionString: readDatabaseUrl(),
    max: 10,
    application_name: 'ai-player-provider-postgres-gateway',
  })

  if (command === '--migrate') {
    await applyAiPlayerProviderPostgresGatewayMigration(pool)
    await pool.end()
    console.log(JSON.stringify({ ok: true, command: 'migrate', gateway: 'ai-player-provider-postgres' }))
    return
  }

  if (shouldAutoMigrate()) {
    await applyAiPlayerProviderPostgresGatewayMigration(pool)
  }

  const store = new AiPlayerProviderPostgresGatewayStore(pool)
  const server = createServer(createAiPlayerProviderPostgresGatewayHandler(store, {
    ledgerAuditHmacSecret: process.env[LEDGER_AUDIT_HMAC_SECRET_ENV],
    budgetGateHmacSecret: process.env[BUDGET_GATE_HMAC_SECRET_ENV],
  }))
  const host = readHost()
  const port = readPort()

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => resolve())
  })

  console.log(JSON.stringify({
    ok: true,
    command: 'serve',
    gateway: 'ai-player-provider-postgres',
    host,
    port,
    endpoints: ['/health', '/ingest', '/budget-gate'],
    autoMigrate: shouldAutoMigrate(),
  }))

  const shutdown = async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()))
    })
    await pool.end()
  }
  process.once('SIGINT', () => {
    void shutdown().finally(() => process.exit(0))
  })
  process.once('SIGTERM', () => {
    void shutdown().finally(() => process.exit(0))
  })
}

run().catch((error: unknown) => {
  console.error(JSON.stringify({
    ok: false,
    error: error instanceof Error ? error.message : String(error),
  }))
  process.exit(1)
})
