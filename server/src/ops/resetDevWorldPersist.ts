import { copyFileSync, existsSync, mkdirSync, rmSync, statSync } from 'node:fs'
import { relative, resolve, join } from 'node:path'

import { WORLD_STATE_PERSIST_PATH } from '../application/world/persistence/worldPersistencePaths'

type ResetReport = {
  ok: boolean
  mode: 'dry-run' | 'reset'
  checkedAt: string
  targetPath: string
  allowedRoot: string
  exists: boolean
  deleted: boolean
  backupPath: string | null
  blockedReason: string | null
  notes: string[]
}

function hasArg(name: string) {
  return process.argv.includes(name)
}

function getArgValue(name: string) {
  const prefix = `${name}=`
  const inline = process.argv.find((arg) => arg.startsWith(prefix))
  if (inline) {
    return inline.slice(prefix.length).trim()
  }
  const index = process.argv.indexOf(name)
  if (index >= 0) {
    return process.argv[index + 1]?.trim()
  }
  return undefined
}

function isPathInsideStrict(parentRaw: string, childRaw: string) {
  const parent = resolve(parentRaw)
  const child = resolve(childRaw)
  const rel = relative(parent, child)
  return rel === '' || (!!rel && !rel.startsWith('..') && !rel.includes(':'))
}

async function isBackendRunning() {
  if (process.env.DEV_WORLD_RESET_SKIP_HEALTH_CHECK === '1') {
    return false
  }
  const healthUrl =
    process.env.DEV_WORLD_RESET_HEALTH_URL?.trim() ||
    `http://${process.env.HOST ?? '127.0.0.1'}:${process.env.PORT ?? '8787'}/api/health`

  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(1_500) })
    return response.ok
  } catch {
    return false
  }
}

function buildBackupPath(targetPath: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupDir = join(process.cwd(), 'tmp', 'dev-world-persist-reset', stamp)
  mkdirSync(backupDir, { recursive: true })
  return join(backupDir, targetPath.split(/[\\/]/).pop() ?? 'world_snapshot.json')
}

async function main() {
  const confirmed = hasArg('--confirm-dev-reset')
  const targetPath = resolve(getArgValue('--path') || process.env.DEV_WORLD_RESET_TARGET_PATH || WORLD_STATE_PERSIST_PATH)
  const allowedRoot = resolve(process.cwd(), 'tmp')
  const exists = existsSync(targetPath)
  const notes = [
    'This command is only for local development world snapshots.',
    'It never reseeds an online persisted world in place.',
    'Use a new WORLD_STATE_PERSIST_PATH for new server or new season validation.',
  ]

  let blockedReason: string | null = null
  if (process.env.NODE_ENV === 'production') {
    blockedReason = 'NODE_ENV=production is not allowed'
  } else if (!isPathInsideStrict(allowedRoot, targetPath)) {
    blockedReason = `target path must be inside ${allowedRoot}`
  } else if (exists && statSync(targetPath).isDirectory()) {
    blockedReason = 'target path is a directory'
  } else if (await isBackendRunning()) {
    blockedReason = 'backend appears to be running; stop it before resetting the dev world snapshot'
  }

  const report: ResetReport = {
    ok: blockedReason === null,
    mode: confirmed ? 'reset' : 'dry-run',
    checkedAt: new Date().toISOString(),
    targetPath,
    allowedRoot,
    exists,
    deleted: false,
    backupPath: null,
    blockedReason,
    notes,
  }

  if (blockedReason || !confirmed || !exists) {
    console.info(JSON.stringify(report, null, 2))
    process.exit(blockedReason ? 1 : 0)
  }

  const backupPath = buildBackupPath(targetPath)
  copyFileSync(targetPath, backupPath)
  rmSync(targetPath, { force: true })

  report.deleted = true
  report.backupPath = backupPath
  console.info(JSON.stringify(report, null, 2))
}

void main().catch((error) => {
  const targetPath = resolve(getArgValue('--path') || process.env.DEV_WORLD_RESET_TARGET_PATH || WORLD_STATE_PERSIST_PATH)
  const report: ResetReport = {
    ok: false,
    mode: hasArg('--confirm-dev-reset') ? 'reset' : 'dry-run',
    checkedAt: new Date().toISOString(),
    targetPath,
    allowedRoot: resolve(process.cwd(), 'tmp'),
    exists: existsSync(targetPath),
    deleted: false,
    backupPath: null,
    blockedReason: error instanceof Error ? error.message : 'dev world persist reset failed',
    notes: ['This command is only for local development world snapshots.'],
  }
  console.error(JSON.stringify(report, null, 2))
  process.exit(1)
})
