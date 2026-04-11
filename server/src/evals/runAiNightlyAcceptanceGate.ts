import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAiHubConfigPersistHealth } from '../application/ai/AiConfigService'
import { getFactionConfigPersistHealth } from '../application/faction/FactionConfigStore'
import { getV2GamePersistHealth } from '../application/v2/V2GameService'
import {
  getSaveSlotsPersistHealth,
  runSaveSlotsArchiveRestoreDrill,
  runSaveSlotsArchiveRestoreRollbackDrill,
} from '../application/world/WorldService'
import { getSessionPersistHealth } from '../multiplayer/SessionManager'

type AlertSeverity = 'high' | 'medium'
type AlertSource = 'factionConfig' | 'aiConfig' | 'v2Game' | 'session' | 'saveSlots'
type AlertCode =
  | 'missing_encryption_key'
  | 'plaintext_persist_enabled'
  | 'persist_failures'
  | 'quarantine_detected'
  | 'quarantine_surge'
  | 'save_slots_oversize_soft'
  | 'save_slots_oversize_hard'
  | 'save_slots_archive_failures'
  | 'save_slots_lock_contention'
  | 'save_slots_lock_failures'
  | 'save_slots_restore_drill_failures'
  | 'save_slots_restore_apply_failures'
  | 'save_slots_restore_rollback_drill_failures'

type NightlyAlert = {
  severity: AlertSeverity
  source: AlertSource
  code: AlertCode
  message: string
}

type NightlyGateCheck = {
  name: string
  passed: boolean
  details?: Record<string, unknown>
}

type AiMainlineReport = {
  runId: string
  passed: boolean
  generatedAt?: string
  lastModifiedAt?: string
}

type SessionSecurityReport = {
  runId: string
  passed: boolean
  generatedAt?: string
  lastModifiedAt?: string
}

type SaveSlotsRestoreApplyGateReport = {
  runId: string
  passed: boolean
  generatedAt?: string
  lastModifiedAt?: string
}

type TemplateReplayCheck = {
  name?: string
  passed?: boolean
}

type TemplateReplayStep = {
  templateId?: string
  required?: boolean
  resultOk?: boolean
}

type TemplateReplayReport = {
  runId: string
  passed: boolean
  generatedAt?: string
  lastModifiedAt?: string
  fixture?: {
    fixtureSlotId?: string
    backupSlotId?: string
    source?: string
    restoreWorld?: boolean
  }
  checks?: TemplateReplayCheck[]
  steps?: TemplateReplayStep[]
}

type NightlyGateReport = {
  runId: string
  generatedAt: string
  executionMode: 'full' | 'reuse_latest_reports'
  reuseMaxReportAgeSec: number
  checks: NightlyGateCheck[]
  passed: boolean
  alerts: NightlyAlert[]
  allowedHighAlertCodes: string[]
  blockingHighAlerts: NightlyAlert[]
  mainlineGate: {
    exitCode: number
    runId?: string
    passed?: boolean
    stdoutTail?: string
    stderrTail?: string
    spawnError?: string
  }
  sessionSecurityGate: {
    exitCode: number
    runId?: string
    passed?: boolean
    stdoutTail?: string
    stderrTail?: string
    spawnError?: string
  }
  saveSlotsRestoreApplyGate: {
    exitCode: number
    runId?: string
    passed?: boolean
    stdoutTail?: string
    stderrTail?: string
    spawnError?: string
  }
  templateReplayGate: {
    runId?: string
    passed?: boolean
    fixtureSource?: string
    fixtureRestoreWorld?: boolean
    fixtureChecksPassed?: boolean
    allStepsRequired?: boolean
    requiredFailedSteps?: string[]
  }
  persistence: {
    factionConfig: ReturnType<typeof getFactionConfigPersistHealth>
    aiConfig: ReturnType<typeof getAiHubConfigPersistHealth>
    v2Game: ReturnType<typeof getV2GamePersistHealth>
    session: ReturnType<typeof getSessionPersistHealth>
    saveSlots: ReturnType<typeof getSaveSlotsPersistHealth>
  }
}

function createRunContext() {
  const runId = `ai_nightly_${new Date().toISOString().replace(/[:.]/g, '-')}`
  const runDir = join(process.cwd(), 'tmp', 'gates', 'ai-nightly-acceptance')
  mkdirSync(runDir, { recursive: true })
  return { runId, runDir }
}

function parseAllowedHighAlertCodes() {
  const raw = process.env.NIGHTLY_ALLOWED_HIGH_ALERT_CODES?.trim() || 'missing_encryption_key'
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}

function parseBooleanEnv(name: string, defaultValue = false): boolean {
  const raw = process.env[name]?.trim().toLowerCase()
  if (!raw) {
    return defaultValue
  }
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on'
}

function parseReuseMaxReportAgeSec() {
  const raw = Number(process.env.NIGHTLY_REUSE_MAX_REPORT_AGE_SEC ?? '900')
  if (!Number.isFinite(raw)) {
    return 900
  }
  return Math.max(60, Math.min(86_400, Math.floor(raw)))
}

function getAgeSeconds(timestamp?: string) {
  if (!timestamp || typeof timestamp !== 'string') {
    return null
  }
  const parsed = Date.parse(timestamp)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return Math.max(0, Math.floor((Date.now() - parsed) / 1000))
}

function resolveReportTimestamp(report: { generatedAt?: string; lastModifiedAt?: string } | null) {
  return report?.generatedAt ?? report?.lastModifiedAt
}

function buildPersistenceAlerts(input: {
  factionConfig: ReturnType<typeof getFactionConfigPersistHealth>
  aiConfig: ReturnType<typeof getAiHubConfigPersistHealth>
  v2Game: ReturnType<typeof getV2GamePersistHealth>
  session: ReturnType<typeof getSessionPersistHealth>
  saveSlots: ReturnType<typeof getSaveSlotsPersistHealth>
}): NightlyAlert[] {
  const alerts: NightlyAlert[] = []

  if (input.factionConfig.security.secretPersistMode === 'memory_only') {
    alerts.push({
      severity: 'high',
      source: 'factionConfig',
      code: 'missing_encryption_key',
      message:
        'BYOK apiKey persistence is disabled because FACTION_APIKEY_ENCRYPTION_KEY is missing and plaintext persist is off.',
    })
  }

  if (input.factionConfig.security.allowPlaintextPersist) {
    alerts.push({
      severity: 'medium',
      source: 'factionConfig',
      code: 'plaintext_persist_enabled',
      message: 'FACTION_APIKEY_ALLOW_PLAINTEXT_PERSIST is enabled; BYOK apiKey may be persisted in plaintext.',
    })
  }

  const persistFailures: Array<{ source: AlertSource; failureCount: number }> = [
    { source: 'factionConfig', failureCount: input.factionConfig.persistFailureCount },
    { source: 'aiConfig', failureCount: input.aiConfig.persistFailureCount },
    { source: 'v2Game', failureCount: input.v2Game.persistFailureCount },
    { source: 'session', failureCount: input.session.persistFailureCount },
    { source: 'saveSlots', failureCount: input.saveSlots.persistFailureCount },
  ]

  for (const item of persistFailures) {
    if (item.failureCount <= 0) {
      continue
    }
    alerts.push({
      severity: item.failureCount >= 5 ? 'high' : 'medium',
      source: item.source,
      code: 'persist_failures',
      message: `Detected ${item.failureCount} persistence write failures for ${item.source}.`,
    })
  }

  const quarantines: Array<{ source: AlertSource; quarantineCount: number }> = [
    { source: 'factionConfig', quarantineCount: input.factionConfig.corruptQuarantineCount },
    { source: 'aiConfig', quarantineCount: input.aiConfig.corruptQuarantineCount },
    { source: 'v2Game', quarantineCount: input.v2Game.corruptQuarantineCount },
    { source: 'session', quarantineCount: input.session.corruptQuarantineCount },
    { source: 'saveSlots', quarantineCount: input.saveSlots.corruptQuarantineCount },
  ]

  for (const item of quarantines) {
    if (item.quarantineCount <= 0) {
      continue
    }

    const surge = item.quarantineCount >= 3
    alerts.push({
      severity: surge ? 'high' : 'medium',
      source: item.source,
      code: surge ? 'quarantine_surge' : 'quarantine_detected',
      message: `Detected ${item.quarantineCount} corrupt-store quarantine events for ${item.source}.`,
    })
  }

  const saveSlotsFileSizeBytes = input.saveSlots.fileSizeBytes
  if (input.saveSlots.fileSizeLevel === 'hard' && typeof saveSlotsFileSizeBytes === 'number') {
    alerts.push({
      severity: 'high',
      source: 'saveSlots',
      code: 'save_slots_oversize_hard',
      message: `Save-slot store size ${saveSlotsFileSizeBytes} bytes reached hard limit ${input.saveSlots.hardLimitBytes} bytes.`,
    })
  } else if (input.saveSlots.fileSizeLevel === 'soft' && typeof saveSlotsFileSizeBytes === 'number') {
    alerts.push({
      severity: 'medium',
      source: 'saveSlots',
      code: 'save_slots_oversize_soft',
      message: `Save-slot store size ${saveSlotsFileSizeBytes} bytes reached soft limit ${input.saveSlots.softLimitBytes} bytes.`,
    })
  }

  if (input.saveSlots.archiveFailureCount > 0) {
    alerts.push({
      severity: input.saveSlots.archiveFailureCount >= 3 ? 'high' : 'medium',
      source: 'saveSlots',
      code: 'save_slots_archive_failures',
      message: `Save-slot archive pipeline has ${input.saveSlots.archiveFailureCount} failures.`,
    })
  }

  if (input.saveSlots.lockContentionCount > 0) {
    alerts.push({
      severity: input.saveSlots.lockContentionCount >= 3 ? 'high' : 'medium',
      source: 'saveSlots',
      code: 'save_slots_lock_contention',
      message: `Save-slot persist lock contention observed ${input.saveSlots.lockContentionCount} times.`,
    })
  }

  if (input.saveSlots.lockFailureCount > 0) {
    alerts.push({
      severity: 'high',
      source: 'saveSlots',
      code: 'save_slots_lock_failures',
      message: `Save-slot persist lock operations failed ${input.saveSlots.lockFailureCount} times.`,
    })
  }

  if (input.saveSlots.restoreDrillFailureCount > 0) {
    alerts.push({
      severity: input.saveSlots.restoreDrillFailureCount >= 3 ? 'high' : 'medium',
      source: 'saveSlots',
      code: 'save_slots_restore_drill_failures',
      message: `Save-slot archive restore drills failed ${input.saveSlots.restoreDrillFailureCount} times.`,
    })
  }

  if (input.saveSlots.restoreApplyFailureCount > 0) {
    alerts.push({
      severity: input.saveSlots.restoreApplyFailureCount >= 3 ? 'high' : 'medium',
      source: 'saveSlots',
      code: 'save_slots_restore_apply_failures',
      message: `Save-slot archive restore apply failed ${input.saveSlots.restoreApplyFailureCount} times.`,
    })
  }

  if (input.saveSlots.restoreRollbackDrillFailureCount > 0) {
    alerts.push({
      severity: input.saveSlots.restoreRollbackDrillFailureCount >= 3 ? 'high' : 'medium',
      source: 'saveSlots',
      code: 'save_slots_restore_rollback_drill_failures',
      message: `Save-slot restore rollback drills failed ${input.saveSlots.restoreRollbackDrillFailureCount} times.`,
    })
  }

  return alerts
}

function runAiMainlineGate() {
  const npmExecPath = process.env.npm_execpath?.trim()
  const result =
    npmExecPath
      ? spawnSync(process.execPath, [npmExecPath, 'run', 'gate:ai:mainline:stability'], {
          cwd: process.cwd(),
          encoding: 'utf8',
        })
      : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'gate:ai:mainline:stability'], {
          cwd: process.cwd(),
          encoding: 'utf8',
        })
  const exitCode = typeof result.status === 'number' ? result.status : 1
  return {
    exitCode,
    stdoutTail: result.stdout?.trim().slice(-1200),
    stderrTail: result.stderr?.trim().slice(-1200),
    spawnError: result.error instanceof Error ? result.error.message : undefined,
  }
}

function runSessionSecurityGate() {
  const npmExecPath = process.env.npm_execpath?.trim()
  const result =
    npmExecPath
      ? spawnSync(process.execPath, [npmExecPath, 'run', 'gate:session:security'], {
          cwd: process.cwd(),
          encoding: 'utf8',
        })
      : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'gate:session:security'], {
          cwd: process.cwd(),
          encoding: 'utf8',
        })
  const exitCode = typeof result.status === 'number' ? result.status : 1
  return {
    exitCode,
    stdoutTail: result.stdout?.trim().slice(-1200),
    stderrTail: result.stderr?.trim().slice(-1200),
    spawnError: result.error instanceof Error ? result.error.message : undefined,
  }
}

function runSaveSlotsRestoreApplyGate() {
  const npmExecPath = process.env.npm_execpath?.trim()
  const result =
    npmExecPath
      ? spawnSync(process.execPath, [npmExecPath, 'run', 'gate:save-slots:restore-apply:stability'], {
          cwd: process.cwd(),
          encoding: 'utf8',
        })
      : spawnSync(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['run', 'gate:save-slots:restore-apply:stability'], {
          cwd: process.cwd(),
          encoding: 'utf8',
        })
  const exitCode = typeof result.status === 'number' ? result.status : 1
  return {
    exitCode,
    stdoutTail: result.stdout?.trim().slice(-1200),
    stderrTail: result.stderr?.trim().slice(-1200),
    spawnError: result.error instanceof Error ? result.error.message : undefined,
  }
}

function readMainlineLatestReport(): AiMainlineReport | null {
  try {
    const latestPath = join(
      process.cwd(),
      'tmp',
      'gates',
      'ai-mainline-stability',
      'ai_mainline_stability_latest.json',
    )
    const stat = statSync(latestPath)
    const raw = readFileSync(latestPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<AiMainlineReport>
    if (typeof parsed.runId !== 'string' || typeof parsed.passed !== 'boolean') {
      return null
    }
    return {
      runId: parsed.runId,
      passed: parsed.passed,
      generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : undefined,
      lastModifiedAt: stat.mtime.toISOString(),
    }
  } catch {
    return null
  }
}

function readSessionSecurityLatestReport(): SessionSecurityReport | null {
  try {
    const latestPath = join(
      process.cwd(),
      'tmp',
      'gates',
      'session-security-gate',
      'session_security_gate_latest.json',
    )
    const stat = statSync(latestPath)
    const raw = readFileSync(latestPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<SessionSecurityReport>
    if (typeof parsed.runId !== 'string' || typeof parsed.passed !== 'boolean') {
      return null
    }
    return {
      runId: parsed.runId,
      passed: parsed.passed,
      generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : undefined,
      lastModifiedAt: stat.mtime.toISOString(),
    }
  } catch {
    return null
  }
}

function readSaveSlotsRestoreApplyLatestReport(): SaveSlotsRestoreApplyGateReport | null {
  try {
    const latestPath = join(
      process.cwd(),
      'tmp',
      'gates',
      'save-slots-restore-apply-gate',
      'save_slots_restore_apply_gate_latest.json',
    )
    const stat = statSync(latestPath)
    const raw = readFileSync(latestPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<SaveSlotsRestoreApplyGateReport>
    if (typeof parsed.runId !== 'string' || typeof parsed.passed !== 'boolean') {
      return null
    }
    return {
      runId: parsed.runId,
      passed: parsed.passed,
      generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : undefined,
      lastModifiedAt: stat.mtime.toISOString(),
    }
  } catch {
    return null
  }
}

function readTemplateReplayLatestReport(): TemplateReplayReport | null {
  try {
    const latestPath = join(
      process.cwd(),
      'tmp',
      'gates',
      'ai_ops_template_replay_latest.json',
    )
    const stat = statSync(latestPath)
    const raw = readFileSync(latestPath, 'utf8')
    const parsed = JSON.parse(raw) as Partial<TemplateReplayReport>
    if (typeof parsed.runId !== 'string' || typeof parsed.passed !== 'boolean') {
      return null
    }
    return {
      runId: parsed.runId,
      passed: parsed.passed,
      generatedAt: typeof parsed.generatedAt === 'string' ? parsed.generatedAt : undefined,
      lastModifiedAt: stat.mtime.toISOString(),
      fixture: parsed.fixture,
      checks: Array.isArray(parsed.checks) ? parsed.checks : [],
      steps: Array.isArray(parsed.steps) ? parsed.steps : [],
    }
  } catch {
    return null
  }
}

function evaluateTemplateReplayGate(report: TemplateReplayReport | null) {
  if (!report) {
    return {
      fixtureChecksPassed: false,
      allStepsRequired: false,
      requiredFailedSteps: [],
      fixtureSource: undefined,
      fixtureRestoreWorld: undefined,
    }
  }

  const checks = Array.isArray(report.checks) ? report.checks : []
  const steps = Array.isArray(report.steps) ? report.steps : []
  const requiredFixtureChecks = ['fixture_slot_primed', 'fixture_slot_loaded', 'fixture_backup_restored']
  const fixtureChecksPassed = requiredFixtureChecks.every((name) =>
    checks.some((item) => item.name === name && item.passed === true),
  )
  const allStepsRequired = steps.length > 0 && steps.every((item) => item.required === true)
  const requiredFailedSteps = steps
    .filter((item) => item.required === true && item.resultOk !== true)
    .map((item) => (typeof item.templateId === 'string' ? item.templateId : 'unknown_step'))

  return {
    fixtureChecksPassed,
    allStepsRequired,
    requiredFailedSteps,
    fixtureSource: report.fixture?.source,
    fixtureRestoreWorld: report.fixture?.restoreWorld,
  }
}

function persistReport(runDir: string, runId: string, report: NightlyGateReport) {
  const latestPath = join(runDir, 'ai_nightly_acceptance_latest.json')
  const stampedPath = join(runDir, `${runId}.json`)
  const payload = JSON.stringify(report, null, 2)
  writeFileSync(latestPath, payload, 'utf8')
  writeFileSync(stampedPath, payload, 'utf8')
}

async function main() {
  const { runId, runDir } = createRunContext()
  const checks: NightlyGateCheck[] = []
  const reuseLatestReports = parseBooleanEnv('NIGHTLY_REUSE_LATEST_GATES', false)
  const reuseMaxReportAgeSec = parseReuseMaxReportAgeSec()
  const mainline = reuseLatestReports
    ? {
        exitCode: 0,
        stdoutTail: 'skipped: reused latest report',
        stderrTail: '',
        spawnError: undefined,
      }
    : runAiMainlineGate()
  const mainlineReport = readMainlineLatestReport()
  const templateReplayReport = readTemplateReplayLatestReport()
  const templateReplayEval = evaluateTemplateReplayGate(templateReplayReport)
  const sessionSecurity = reuseLatestReports
    ? {
        exitCode: 0,
        stdoutTail: 'skipped: reused latest report',
        stderrTail: '',
        spawnError: undefined,
      }
    : runSessionSecurityGate()
  const sessionSecurityReport = readSessionSecurityLatestReport()
  const saveSlotsRestoreApply = runSaveSlotsRestoreApplyGate()
  const saveSlotsRestoreApplyReport = readSaveSlotsRestoreApplyLatestReport()

  checks.push({
    name: 'mainline_gate_exit_zero',
    passed: mainline.exitCode === 0,
    details: { exitCode: mainline.exitCode },
  })

  checks.push({
    name: 'mainline_report_parsed',
    passed: Boolean(mainlineReport),
    details: { runId: mainlineReport?.runId, passed: mainlineReport?.passed },
  })

  if (reuseLatestReports) {
    const mainlineAgeSec = getAgeSeconds(resolveReportTimestamp(mainlineReport))
    checks.push({
      name: 'mainline_report_fresh_when_reuse',
      passed: typeof mainlineAgeSec === 'number' && mainlineAgeSec <= reuseMaxReportAgeSec,
      details: {
        ageSec: mainlineAgeSec,
        maxAgeSec: reuseMaxReportAgeSec,
        timestamp: resolveReportTimestamp(mainlineReport),
      },
    })
  }

  checks.push({
    name: 'template_replay_report_parsed',
    passed: Boolean(templateReplayReport),
    details: { runId: templateReplayReport?.runId, passed: templateReplayReport?.passed },
  })

  if (reuseLatestReports) {
    const templateReplayAgeSec = getAgeSeconds(resolveReportTimestamp(templateReplayReport))
    checks.push({
      name: 'template_replay_report_fresh_when_reuse',
      passed: typeof templateReplayAgeSec === 'number' && templateReplayAgeSec <= reuseMaxReportAgeSec,
      details: {
        ageSec: templateReplayAgeSec,
        maxAgeSec: reuseMaxReportAgeSec,
        timestamp: resolveReportTimestamp(templateReplayReport),
      },
    })
  }

  checks.push({
    name: 'template_replay_passed',
    passed: templateReplayReport?.passed === true,
    details: {
      runId: templateReplayReport?.runId,
      passed: templateReplayReport?.passed,
    },
  })

  checks.push({
    name: 'template_replay_fixture_checks_passed',
    passed: templateReplayEval.fixtureChecksPassed,
    details: {
      fixtureSource: templateReplayEval.fixtureSource,
      fixtureRestoreWorld: templateReplayEval.fixtureRestoreWorld,
      requiredChecks: ['fixture_slot_primed', 'fixture_slot_loaded', 'fixture_backup_restored'],
    },
  })

  checks.push({
    name: 'template_replay_all_steps_required',
    passed: templateReplayEval.allStepsRequired,
    details: {
      allStepsRequired: templateReplayEval.allStepsRequired,
      requiredFailedSteps: templateReplayEval.requiredFailedSteps,
    },
  })

  checks.push({
    name: 'session_security_gate_exit_zero',
    passed: sessionSecurity.exitCode === 0,
    details: { exitCode: sessionSecurity.exitCode },
  })

  checks.push({
    name: 'session_security_report_parsed',
    passed: Boolean(sessionSecurityReport),
    details: { runId: sessionSecurityReport?.runId, passed: sessionSecurityReport?.passed },
  })

  checks.push({
    name: 'save_slots_restore_apply_gate_exit_zero',
    passed: saveSlotsRestoreApply.exitCode === 0,
    details: { exitCode: saveSlotsRestoreApply.exitCode },
  })

  checks.push({
    name: 'save_slots_restore_apply_gate_report_parsed',
    passed: Boolean(saveSlotsRestoreApplyReport),
    details: { runId: saveSlotsRestoreApplyReport?.runId, passed: saveSlotsRestoreApplyReport?.passed },
  })

  checks.push({
    name: 'save_slots_restore_apply_gate_passed',
    passed: saveSlotsRestoreApplyReport?.passed === true,
    details: { runId: saveSlotsRestoreApplyReport?.runId, passed: saveSlotsRestoreApplyReport?.passed },
  })

  if (reuseLatestReports) {
    const sessionAgeSec = getAgeSeconds(resolveReportTimestamp(sessionSecurityReport))
    checks.push({
      name: 'session_security_report_fresh_when_reuse',
      passed: typeof sessionAgeSec === 'number' && sessionAgeSec <= reuseMaxReportAgeSec,
      details: {
        ageSec: sessionAgeSec,
        maxAgeSec: reuseMaxReportAgeSec,
        timestamp: resolveReportTimestamp(sessionSecurityReport),
      },
    })
  }

  const saveSlotsArchiveRestoreDrill = runSaveSlotsArchiveRestoreDrill()
  const saveSlotsArchiveRestoreRollbackDrill = runSaveSlotsArchiveRestoreRollbackDrill({
    drillDir: join(runDir, 'save-slots-rollback-drill'),
  })

  const persistence = {
    factionConfig: getFactionConfigPersistHealth(),
    aiConfig: getAiHubConfigPersistHealth(),
    v2Game: getV2GamePersistHealth(),
    session: getSessionPersistHealth(),
    saveSlots: getSaveSlotsPersistHealth(),
  }

  checks.push({
    name: 'persistence_snapshot_available',
    passed: Boolean(
      persistence.factionConfig.path &&
      persistence.aiConfig.path &&
      persistence.v2Game.path &&
      persistence.session.path &&
      persistence.saveSlots.path,
    ),
    details: {
      factionConfigPath: persistence.factionConfig.path,
      aiConfigPath: persistence.aiConfig.path,
      v2GamePath: persistence.v2Game.path,
      sessionPath: persistence.session.path,
      saveSlotsPath: persistence.saveSlots.path,
    },
  })

  checks.push({
    name: 'save_slots_not_hard_oversize',
    passed: persistence.saveSlots.fileSizeLevel !== 'hard',
    details: {
      fileSizeLevel: persistence.saveSlots.fileSizeLevel,
      fileSizeBytes: persistence.saveSlots.fileSizeBytes,
      softLimitBytes: persistence.saveSlots.softLimitBytes,
      hardLimitBytes: persistence.saveSlots.hardLimitBytes,
    },
  })

  checks.push({
    name: 'save_slots_archive_failures_absent',
    passed: persistence.saveSlots.archiveFailureCount === 0,
    details: {
      archiveFailureCount: persistence.saveSlots.archiveFailureCount,
      archiveSuccessCount: persistence.saveSlots.archiveSuccessCount,
      archiveFileCount: persistence.saveSlots.archiveFileCount,
      archiveOnSoftLimit: persistence.saveSlots.archiveOnSoftLimit,
      archiveDir: persistence.saveSlots.archiveDir,
    },
  })

  checks.push({
    name: 'save_slots_lock_contention_absent',
    passed: persistence.saveSlots.lockContentionCount === 0,
    details: {
      lockContentionCount: persistence.saveSlots.lockContentionCount,
      lockStealCount: persistence.saveSlots.lockStealCount,
      lockFailureCount: persistence.saveSlots.lockFailureCount,
      lockPath: persistence.saveSlots.lockPath,
      lockStaleMs: persistence.saveSlots.lockStaleMs,
    },
  })

  checks.push({
    name: 'save_slots_lock_failures_absent',
    passed: persistence.saveSlots.lockFailureCount === 0,
    details: {
      lockFailureCount: persistence.saveSlots.lockFailureCount,
      lockContentionCount: persistence.saveSlots.lockContentionCount,
      lockStealCount: persistence.saveSlots.lockStealCount,
    },
  })

  checks.push({
    name: 'save_slots_archive_restore_drill_passed',
    passed: saveSlotsArchiveRestoreDrill.status !== 'failed',
    details: saveSlotsArchiveRestoreDrill,
  })

  checks.push({
    name: 'save_slots_restore_apply_metrics_observable',
    passed:
      typeof persistence.saveSlots.restoreApplySuccessCount === 'number' &&
      typeof persistence.saveSlots.restoreApplyFailureCount === 'number' &&
      (persistence.saveSlots.lastRestoreApplyStatus === null ||
        persistence.saveSlots.lastRestoreApplyStatus === 'restored' ||
        persistence.saveSlots.lastRestoreApplyStatus === 'skipped' ||
        persistence.saveSlots.lastRestoreApplyStatus === 'failed'),
    details: {
      restoreApplySuccessCount: persistence.saveSlots.restoreApplySuccessCount,
      restoreApplyFailureCount: persistence.saveSlots.restoreApplyFailureCount,
      lastRestoreApplyStatus: persistence.saveSlots.lastRestoreApplyStatus,
      lastRestoreApplyAt: persistence.saveSlots.lastRestoreApplyAt,
      lastRestoreApplyErrorAt: persistence.saveSlots.lastRestoreApplyErrorAt,
      lastRestoreApplyMessage: persistence.saveSlots.lastRestoreApplyMessage,
      lastRestoreApplyArchivePath: persistence.saveSlots.lastRestoreApplyArchivePath,
      lastRestoreApplyBackupPath: persistence.saveSlots.lastRestoreApplyBackupPath,
    },
  })

  const restoreApplyMessage =
    typeof persistence.saveSlots.lastRestoreApplyMessage === 'string'
      ? persistence.saveSlots.lastRestoreApplyMessage
      : ''
  const restoreApplyNeedsRollbackTrace =
    persistence.saveSlots.lastRestoreApplyStatus === 'failed' &&
    restoreApplyMessage.startsWith('Archive restore apply failed:')
  const restoreApplyHasRollbackTrace =
    !restoreApplyNeedsRollbackTrace || restoreApplyMessage.includes('Rollback')

  checks.push({
    name: 'save_slots_restore_apply_failure_rollback_trace',
    passed: restoreApplyHasRollbackTrace,
    details: {
      needsRollbackTrace: restoreApplyNeedsRollbackTrace,
      hasRollbackTrace: restoreApplyHasRollbackTrace,
      lastRestoreApplyStatus: persistence.saveSlots.lastRestoreApplyStatus,
      lastRestoreApplyMessage: persistence.saveSlots.lastRestoreApplyMessage,
      lastRestoreApplyBackupPath: persistence.saveSlots.lastRestoreApplyBackupPath,
    },
  })

  checks.push({
    name: 'save_slots_archive_restore_rollback_drill_passed',
    passed: saveSlotsArchiveRestoreRollbackDrill.status !== 'failed',
    details: saveSlotsArchiveRestoreRollbackDrill,
  })

  const alerts = buildPersistenceAlerts(persistence)
  const allowedHighAlertCodes = parseAllowedHighAlertCodes()
  const blockingHighAlerts = alerts.filter(
    (alert) => alert.severity === 'high' && !allowedHighAlertCodes.includes(alert.code),
  )

  checks.push({
    name: 'blocking_high_alerts_absent',
    passed: blockingHighAlerts.length === 0,
    details: {
      highAlertCount: alerts.filter((alert) => alert.severity === 'high').length,
      blockingHighAlertCount: blockingHighAlerts.length,
      allowedHighAlertCodes,
    },
  })

  const passed = checks.every((item) => item.passed)
  const report: NightlyGateReport = {
    runId,
    generatedAt: new Date().toISOString(),
    executionMode: reuseLatestReports ? 'reuse_latest_reports' : 'full',
    reuseMaxReportAgeSec,
    checks,
    passed,
    alerts,
    allowedHighAlertCodes,
    blockingHighAlerts,
    mainlineGate: {
      exitCode: mainline.exitCode,
      runId: mainlineReport?.runId,
      passed: mainlineReport?.passed,
      stdoutTail: mainline.stdoutTail,
      stderrTail: mainline.stderrTail,
      spawnError: mainline.spawnError,
    },
    sessionSecurityGate: {
      exitCode: sessionSecurity.exitCode,
      runId: sessionSecurityReport?.runId,
      passed: sessionSecurityReport?.passed,
      stdoutTail: sessionSecurity.stdoutTail,
      stderrTail: sessionSecurity.stderrTail,
      spawnError: sessionSecurity.spawnError,
    },
    saveSlotsRestoreApplyGate: {
      exitCode: saveSlotsRestoreApply.exitCode,
      runId: saveSlotsRestoreApplyReport?.runId,
      passed: saveSlotsRestoreApplyReport?.passed,
      stdoutTail: saveSlotsRestoreApply.stdoutTail,
      stderrTail: saveSlotsRestoreApply.stderrTail,
      spawnError: saveSlotsRestoreApply.spawnError,
    },
    templateReplayGate: {
      runId: templateReplayReport?.runId,
      passed: templateReplayReport?.passed,
      fixtureSource: templateReplayEval.fixtureSource,
      fixtureRestoreWorld: templateReplayEval.fixtureRestoreWorld,
      fixtureChecksPassed: templateReplayEval.fixtureChecksPassed,
      allStepsRequired: templateReplayEval.allStepsRequired,
      requiredFailedSteps: templateReplayEval.requiredFailedSteps,
    },
    persistence,
  }

  persistReport(runDir, runId, report)
  console.info(JSON.stringify(report, null, 2))
  process.exit(passed ? 0 : 1)
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'ai nightly acceptance gate failed'
  console.error(message)
  process.exit(1)
})
