import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type GateCheck = {
  name?: string
  passed?: boolean
}

type SessionSecurityLatestReport = {
  runId: string
  generatedAt?: string
  passed: boolean
  checks?: GateCheck[]
}

type MainlineLatestReport = {
  runId: string
  generatedAt?: string
  passed: boolean
  checks?: GateCheck[]
  templateReplay?: {
    runId?: string
    passed?: boolean
  }
}

type NightlyLatestReport = {
  runId: string
  generatedAt?: string
  executionMode?: string
  passed: boolean
  checks?: GateCheck[]
  mainlineGate?: {
    runId?: string
    passed?: boolean
  }
  sessionSecurityGate?: {
    runId?: string
    passed?: boolean
  }
  templateReplayGate?: {
    runId?: string
    passed?: boolean
    fixtureChecksPassed?: boolean
    allStepsRequired?: boolean
    requiredFailedSteps?: string[]
  }
  saveSlotsRestoreApplyGate?: {
    runId?: string
    passed?: boolean
  }
}

type TemplateReplayLatestReport = {
  runId: string
  generatedAt?: string
  passed: boolean
  checks?: GateCheck[]
  steps?: Array<{
    templateId?: string
    required?: boolean
    resultOk?: boolean
  }>
}

type SaveSlotsRestoreApplyLatestReport = {
  runId: string
  generatedAt?: string
  passed: boolean
  checks?: GateCheck[]
  source?: {
    archiveSourceMode?: string
  }
  restore?: {
    firstStatus?: string | null
    secondStatus?: string | null
    thirdStatus?: string | null
  }
  health?: {
    restoreApplySuccessCount?: number | null
    restoreApplyFailureCount?: number | null
    lastRestoreApplyStatus?: string | null
  }
  artifacts?: {
    keepRecent?: number
    retainedRunIds?: string[]
    prunedRunIds?: string[]
    prunedReports?: number
    prunedWorkspaces?: number
  }
}

type GateTrioSummaryReport = {
  runId: string
  generatedAt: string
  overallPassed: boolean
  reports: {
    sessionSecurity: {
      path: string
      runId: string
      passed: boolean
      generatedAt?: string
      ageSec: number | null
      failedChecks: string[]
    }
    mainline: {
      path: string
      runId: string
      passed: boolean
      generatedAt?: string
      ageSec: number | null
      failedChecks: string[]
      templateReplayRunId?: string
    }
    nightly: {
      path: string
      runId: string
      passed: boolean
      generatedAt?: string
      ageSec: number | null
      executionMode?: string
      failedChecks: string[]
      references: {
        mainlineRunId?: string
        sessionSecurityRunId?: string
        templateReplayRunId?: string
      }
      templateReplayGate?: {
        passed?: boolean
        fixtureChecksPassed?: boolean
        allStepsRequired?: boolean
        requiredFailedSteps?: string[]
      }
    }
    templateReplay: {
      path: string
      runId: string
      passed: boolean
      generatedAt?: string
      ageSec: number | null
      failedChecks: string[]
      requiredFailedSteps: string[]
      allStepsRequired: boolean
    }
    saveSlotsRestoreApply: {
      path: string
      runId: string
      passed: boolean
      generatedAt?: string
      ageSec: number | null
      failedChecks: string[]
      sourceArchiveMode?: string
      restore?: {
        firstStatus?: string | null
        secondStatus?: string | null
        thirdStatus?: string | null
      }
      health?: {
        restoreApplySuccessCount?: number | null
        restoreApplyFailureCount?: number | null
        lastRestoreApplyStatus?: string | null
      }
      artifacts?: {
        keepRecent?: number
        retainedCount: number
        prunedCount: number
        prunedReports?: number
        prunedWorkspaces?: number
      }
    }
  }
  checks: Array<{
    name: string
    passed: boolean
    details?: Record<string, unknown>
  }>
}

function readJsonWithMtime<T>(path: string): { data: T; mtimeIso: string } {
  const stat = statSync(path)
  const raw = readFileSync(path, 'utf8')
  return {
    data: JSON.parse(raw) as T,
    mtimeIso: stat.mtime.toISOString(),
  }
}

function tryReadJsonWithMtime<T>(path: string): { data: T; mtimeIso: string } | null {
  try {
    return readJsonWithMtime<T>(path)
  } catch {
    return null
  }
}

function resolveAgeSeconds(generatedAt: string | undefined, mtimeIso: string): number | null {
  const source = generatedAt ?? mtimeIso
  const parsed = Date.parse(source)
  if (!Number.isFinite(parsed)) {
    return null
  }
  return Math.max(0, Math.floor((Date.now() - parsed) / 1000))
}

function collectFailedChecks(checks: GateCheck[] | undefined): string[] {
  if (!Array.isArray(checks)) {
    return []
  }
  return checks
    .filter((item) => item.passed !== true)
    .map((item) => (typeof item.name === 'string' && item.name.length > 0 ? item.name : 'unknown_check'))
}

function hasPassedCheck(checks: GateCheck[] | undefined, name: string): boolean {
  if (!Array.isArray(checks)) {
    return false
  }
  return checks.some((item) => item.name === name && item.passed === true)
}

function main() {
  const runId = `gate_trio_summary_${new Date().toISOString().replace(/[:.]/g, '-')}`

  const sessionPath = join(process.cwd(), 'tmp', 'gates', 'session-security-gate', 'session_security_gate_latest.json')
  const mainlinePath = join(process.cwd(), 'tmp', 'gates', 'ai-mainline-stability', 'ai_mainline_stability_latest.json')
  const nightlyPath = join(process.cwd(), 'tmp', 'gates', 'ai-nightly-acceptance', 'ai_nightly_acceptance_latest.json')
  const templateReplayPath = join(process.cwd(), 'tmp', 'gates', 'ai_ops_template_replay_latest.json')
  const saveSlotsRestoreApplyPath = join(
    process.cwd(),
    'tmp',
    'gates',
    'save-slots-restore-apply-gate',
    'save_slots_restore_apply_gate_latest.json',
  )

  const session = readJsonWithMtime<SessionSecurityLatestReport>(sessionPath)
  const mainline = readJsonWithMtime<MainlineLatestReport>(mainlinePath)
  const nightly = readJsonWithMtime<NightlyLatestReport>(nightlyPath)
  const templateReplay = readJsonWithMtime<TemplateReplayLatestReport>(templateReplayPath)
  const saveSlotsRestoreApply = tryReadJsonWithMtime<SaveSlotsRestoreApplyLatestReport>(saveSlotsRestoreApplyPath)

  const sessionFailedChecks = collectFailedChecks(session.data.checks)
  const mainlineFailedChecks = collectFailedChecks(mainline.data.checks)
  const nightlyFailedChecks = collectFailedChecks(nightly.data.checks)
  const templateReplayFailedChecks = collectFailedChecks(templateReplay.data.checks)
  const saveSlotsRestoreApplyFailedChecks = collectFailedChecks(saveSlotsRestoreApply?.data.checks)
  const templateReplayRequiredFailedSteps = (templateReplay.data.steps ?? [])
    .filter((item) => item.required === true && item.resultOk !== true)
    .map((item) => (typeof item.templateId === 'string' ? item.templateId : 'unknown_step'))
  const templateReplayAllStepsRequired =
    Array.isArray(templateReplay.data.steps) &&
    templateReplay.data.steps.length > 0 &&
    templateReplay.data.steps.every((item) => item.required === true)
  const restoreThreePhaseSemanticsPassed =
    saveSlotsRestoreApply?.data.restore?.firstStatus === 'restored' &&
    saveSlotsRestoreApply?.data.restore?.secondStatus === 'skipped' &&
    saveSlotsRestoreApply?.data.restore?.thirdStatus === 'restored'

  const checks: GateTrioSummaryReport['checks'] = [
    {
      name: 'session_security_passed',
      passed: session.data.passed === true,
      details: { runId: session.data.runId, failedChecks: sessionFailedChecks },
    },
    {
      name: 'mainline_passed',
      passed: mainline.data.passed === true,
      details: { runId: mainline.data.runId, failedChecks: mainlineFailedChecks },
    },
    {
      name: 'nightly_passed',
      passed: nightly.data.passed === true,
      details: { runId: nightly.data.runId, failedChecks: nightlyFailedChecks, executionMode: nightly.data.executionMode },
    },
    {
      name: 'template_replay_passed',
      passed: templateReplay.data.passed === true,
      details: {
        runId: templateReplay.data.runId,
        failedChecks: templateReplayFailedChecks,
        requiredFailedSteps: templateReplayRequiredFailedSteps,
      },
    },
    {
      name: 'nightly_references_latest_mainline',
      passed: nightly.data.mainlineGate?.runId === mainline.data.runId,
      details: { nightlyRunId: nightly.data.mainlineGate?.runId, latestRunId: mainline.data.runId },
    },
    {
      name: 'nightly_references_latest_session_security',
      passed: nightly.data.sessionSecurityGate?.runId === session.data.runId,
      details: { nightlyRunId: nightly.data.sessionSecurityGate?.runId, latestRunId: session.data.runId },
    },
    {
      name: 'nightly_references_latest_template_replay',
      passed: nightly.data.templateReplayGate?.runId === templateReplay.data.runId,
      details: { nightlyRunId: nightly.data.templateReplayGate?.runId, latestRunId: templateReplay.data.runId },
    },
    {
      name: 'template_replay_fixture_checks_passed',
      passed:
        hasPassedCheck(templateReplay.data.checks, 'fixture_slot_primed') &&
        hasPassedCheck(templateReplay.data.checks, 'fixture_slot_loaded') &&
        hasPassedCheck(templateReplay.data.checks, 'fixture_backup_restored'),
      details: {
        fixtureSlotPrimed: hasPassedCheck(templateReplay.data.checks, 'fixture_slot_primed'),
        fixtureSlotLoaded: hasPassedCheck(templateReplay.data.checks, 'fixture_slot_loaded'),
        fixtureBackupRestored: hasPassedCheck(templateReplay.data.checks, 'fixture_backup_restored'),
      },
    },
    {
      name: 'template_replay_all_steps_required',
      passed: templateReplayAllStepsRequired,
      details: {
        allStepsRequired: templateReplayAllStepsRequired,
        requiredFailedSteps: templateReplayRequiredFailedSteps,
      },
    },
    {
      name: 'save_slots_restore_apply_gate_passed',
      passed: saveSlotsRestoreApply?.data.passed === true,
      details: {
        runId: saveSlotsRestoreApply?.data.runId,
        failedChecks: saveSlotsRestoreApplyFailedChecks,
      },
    },
    {
      name: 'nightly_references_latest_restore_apply_gate',
      passed:
        typeof saveSlotsRestoreApply?.data.runId === 'string' &&
        nightly.data.saveSlotsRestoreApplyGate?.runId === saveSlotsRestoreApply.data.runId,
      details: {
        nightlyRunId: nightly.data.saveSlotsRestoreApplyGate?.runId,
        latestRunId: saveSlotsRestoreApply?.data.runId,
      },
    },
    {
      name: 'save_slots_restore_apply_three_phase_semantics',
      passed: restoreThreePhaseSemanticsPassed === true,
      details: {
        firstStatus: saveSlotsRestoreApply?.data.restore?.firstStatus,
        secondStatus: saveSlotsRestoreApply?.data.restore?.secondStatus,
        thirdStatus: saveSlotsRestoreApply?.data.restore?.thirdStatus,
      },
    },
  ]

  const overallPassed = checks.every((item) => item.passed)

  const report: GateTrioSummaryReport = {
    runId,
    generatedAt: new Date().toISOString(),
    overallPassed,
    reports: {
      sessionSecurity: {
        path: sessionPath,
        runId: session.data.runId,
        passed: session.data.passed,
        generatedAt: session.data.generatedAt,
        ageSec: resolveAgeSeconds(session.data.generatedAt, session.mtimeIso),
        failedChecks: sessionFailedChecks,
      },
      mainline: {
        path: mainlinePath,
        runId: mainline.data.runId,
        passed: mainline.data.passed,
        generatedAt: mainline.data.generatedAt,
        ageSec: resolveAgeSeconds(mainline.data.generatedAt, mainline.mtimeIso),
        failedChecks: mainlineFailedChecks,
        templateReplayRunId: mainline.data.templateReplay?.runId,
      },
      nightly: {
        path: nightlyPath,
        runId: nightly.data.runId,
        passed: nightly.data.passed,
        generatedAt: nightly.data.generatedAt,
        ageSec: resolveAgeSeconds(nightly.data.generatedAt, nightly.mtimeIso),
        executionMode: nightly.data.executionMode,
        failedChecks: nightlyFailedChecks,
        references: {
          mainlineRunId: nightly.data.mainlineGate?.runId,
          sessionSecurityRunId: nightly.data.sessionSecurityGate?.runId,
          templateReplayRunId: nightly.data.templateReplayGate?.runId,
        },
        templateReplayGate: {
          passed: nightly.data.templateReplayGate?.passed,
          fixtureChecksPassed: nightly.data.templateReplayGate?.fixtureChecksPassed,
          allStepsRequired: nightly.data.templateReplayGate?.allStepsRequired,
          requiredFailedSteps: nightly.data.templateReplayGate?.requiredFailedSteps,
        },
      },
      templateReplay: {
        path: templateReplayPath,
        runId: templateReplay.data.runId,
        passed: templateReplay.data.passed,
        generatedAt: templateReplay.data.generatedAt,
        ageSec: resolveAgeSeconds(templateReplay.data.generatedAt, templateReplay.mtimeIso),
        failedChecks: templateReplayFailedChecks,
        requiredFailedSteps: templateReplayRequiredFailedSteps,
        allStepsRequired: templateReplayAllStepsRequired,
      },
      saveSlotsRestoreApply: {
        path: saveSlotsRestoreApplyPath,
        runId: saveSlotsRestoreApply?.data.runId ?? 'missing',
        passed: saveSlotsRestoreApply?.data.passed === true,
        generatedAt: saveSlotsRestoreApply?.data.generatedAt,
        ageSec:
          saveSlotsRestoreApply?.data && saveSlotsRestoreApply.mtimeIso
            ? resolveAgeSeconds(saveSlotsRestoreApply.data.generatedAt, saveSlotsRestoreApply.mtimeIso)
            : null,
        failedChecks: saveSlotsRestoreApplyFailedChecks,
        sourceArchiveMode: saveSlotsRestoreApply?.data.source?.archiveSourceMode,
        restore: {
          firstStatus: saveSlotsRestoreApply?.data.restore?.firstStatus,
          secondStatus: saveSlotsRestoreApply?.data.restore?.secondStatus,
          thirdStatus: saveSlotsRestoreApply?.data.restore?.thirdStatus,
        },
        health: {
          restoreApplySuccessCount: saveSlotsRestoreApply?.data.health?.restoreApplySuccessCount,
          restoreApplyFailureCount: saveSlotsRestoreApply?.data.health?.restoreApplyFailureCount,
          lastRestoreApplyStatus: saveSlotsRestoreApply?.data.health?.lastRestoreApplyStatus,
        },
        artifacts: {
          keepRecent: saveSlotsRestoreApply?.data.artifacts?.keepRecent,
          retainedCount: saveSlotsRestoreApply?.data.artifacts?.retainedRunIds?.length ?? 0,
          prunedCount: saveSlotsRestoreApply?.data.artifacts?.prunedRunIds?.length ?? 0,
          prunedReports: saveSlotsRestoreApply?.data.artifacts?.prunedReports,
          prunedWorkspaces: saveSlotsRestoreApply?.data.artifacts?.prunedWorkspaces,
        },
      },
    },
    checks,
  }

  const runDir = join(process.cwd(), 'tmp', 'gates', 'gate-trio')
  mkdirSync(runDir, { recursive: true })
  const latestPath = join(runDir, 'gate_trio_summary_latest.json')
  const stampedPath = join(runDir, `${runId}.json`)
  const payload = JSON.stringify(report, null, 2)
  writeFileSync(latestPath, payload, 'utf8')
  writeFileSync(stampedPath, payload, 'utf8')

  console.info(JSON.stringify(report, null, 2))
  process.exit(overallPassed ? 0 : 1)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : 'gate trio summary failed'
  console.error(message)
  process.exit(1)
}
