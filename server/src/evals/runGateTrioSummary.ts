import { mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type GateCheck = {
  name?: string
  passed?: boolean
}

type FreshnessSourceKey = 'sessionSecurity' | 'mainline' | 'nightly' | 'templateReplay' | 'saveSlotsRestoreApply'
type FreshnessSeverity = 'fresh' | 'stale_notice' | 'stale_warning' | 'stale_high' | 'stale_critical' | 'unknown'

type FreshnessTriageItem = {
  report: FreshnessSourceKey
  checkName: string
  runId?: string
  generatedAt?: string
  ageSec: number | null
  maxAgeSec: number
  overdueSec: number | null
  passed: boolean
  stale: boolean
  severity: FreshnessSeverity
  troubleshooting: {
    primaryCommand: string
    componentRefreshCommand: string
    rerunSummaryCommand: string
    note: string
  }
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
  policy: {
    maxReportAgeSec: number
    keepRecent: number
  }
  artifacts?: {
    retainedRunIds: string[]
    prunedRunIds: string[]
    prunedReports: number
  }
  freshnessTriage: {
    staleDetected: boolean
    staleCount: number
    highestSeverity: FreshnessSeverity
    primaryRecommendation?: string
    standaloneSummaryCommand: string
    items: FreshnessTriageItem[]
  }
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

function parseSummaryMaxReportAgeSec() {
  const raw = Number(process.env.GATE_TRIO_SUMMARY_MAX_REPORT_AGE_SEC ?? '900')
  if (!Number.isFinite(raw)) {
    return 900
  }
  return Math.max(60, Math.min(86_400, Math.floor(raw)))
}

function parseSummaryKeepRecent() {
  const raw = Number(process.env.GATE_TRIO_SUMMARY_KEEP_RECENT ?? '12')
  if (!Number.isFinite(raw)) {
    return 12
  }
  return Math.max(1, Math.min(200, Math.floor(raw)))
}

function getComponentRefreshCommand(report: FreshnessSourceKey) {
  switch (report) {
    case 'sessionSecurity':
      return 'npm run gate:session:security'
    case 'mainline':
      return 'npm run gate:ai:mainline:stability'
    case 'nightly':
      return 'npm run gate:ai:nightly:acceptance'
    case 'templateReplay':
      return 'npm run gate:ai:mainline:stability'
    case 'saveSlotsRestoreApply':
      return 'npm run gate:save-slots:restore-apply:stability'
    default:
      return 'npm run gate:ai:trio'
  }
}

function classifyFreshnessSeverity(ageSec: number | null, maxAgeSec: number): FreshnessSeverity {
  if (typeof ageSec !== 'number') {
    return 'unknown'
  }
  if (ageSec <= maxAgeSec) {
    return 'fresh'
  }
  const overdueSec = ageSec - maxAgeSec
  const noticeThreshold = Math.max(60, Math.floor(maxAgeSec * 0.1))
  const warningThreshold = Math.max(300, Math.floor(maxAgeSec * 0.5))
  const highThreshold = Math.max(1800, Math.floor(maxAgeSec * 2))
  if (overdueSec <= noticeThreshold) {
    return 'stale_notice'
  }
  if (overdueSec <= warningThreshold) {
    return 'stale_warning'
  }
  if (overdueSec <= highThreshold) {
    return 'stale_high'
  }
  return 'stale_critical'
}

function freshnessSeverityRank(severity: FreshnessSeverity) {
  switch (severity) {
    case 'fresh':
      return 0
    case 'stale_notice':
      return 1
    case 'stale_warning':
      return 2
    case 'stale_high':
      return 3
    case 'stale_critical':
      return 4
    case 'unknown':
      return 5
    default:
      return 5
  }
}

function buildFreshnessTriageItem(args: {
  report: FreshnessSourceKey
  checkName: string
  runId?: string
  generatedAt?: string
  ageSec: number | null
  maxAgeSec: number
}): FreshnessTriageItem {
  const severity = classifyFreshnessSeverity(args.ageSec, args.maxAgeSec)
  const stale = severity !== 'fresh'
  return {
    report: args.report,
    checkName: args.checkName,
    runId: args.runId,
    generatedAt: args.generatedAt,
    ageSec: args.ageSec,
    maxAgeSec: args.maxAgeSec,
    overdueSec: typeof args.ageSec === 'number' ? Math.max(0, args.ageSec - args.maxAgeSec) : null,
    passed: !stale,
    stale,
    severity,
    troubleshooting: {
      primaryCommand: 'npm run gate:ai:trio',
      componentRefreshCommand: getComponentRefreshCommand(args.report),
      rerunSummaryCommand: 'npm run gate:ai:trio:summary',
      note:
        '单跑 trio summary 发现陈旧时，优先执行 full trio 刷新链；仅在定位局部问题时再执行组件级刷新命令。',
    },
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

function resolveStampedRunFreshness(
  runDir: string,
  runId: string | undefined,
  maxReportAgeSec: number,
): {
  exists: boolean
  fresh: boolean
  ageSec: number | null
  generatedAt?: string
  path?: string
} {
  if (typeof runId !== 'string' || runId.length === 0) {
    return { exists: false, fresh: false, ageSec: null }
  }
  const path = join(runDir, `${runId}.json`)
  const payload = tryReadJsonWithMtime<{ generatedAt?: string }>(path)
  if (!payload) {
    return {
      exists: false,
      fresh: false,
      ageSec: null,
      path,
    }
  }
  const ageSec = resolveAgeSeconds(payload.data.generatedAt, payload.mtimeIso)
  return {
    exists: true,
    fresh: typeof ageSec === 'number' && ageSec <= maxReportAgeSec,
    ageSec,
    generatedAt: payload.data.generatedAt,
    path,
  }
}

function hasPassedCheck(checks: GateCheck[] | undefined, name: string): boolean {
  if (!Array.isArray(checks)) {
    return false
  }
  return checks.some((item) => item.name === name && item.passed === true)
}

function pruneSummaryReports(runDir: string, keepRecent: number) {
  const stampedReports: Array<{ runId: string; path: string; mtimeMs: number }> = []
  for (const name of readdirSync(runDir)) {
    if (name === 'gate_trio_summary_latest.json') {
      continue
    }
    if (!name.startsWith('gate_trio_summary_') || !name.endsWith('.json')) {
      continue
    }
    const fullPath = join(runDir, name)
    try {
      const stat = statSync(fullPath)
      if (!stat.isFile()) {
        continue
      }
      const runId = name.slice(0, -'.json'.length)
      stampedReports.push({ runId, path: fullPath, mtimeMs: stat.mtimeMs })
    } catch {
      // ignore unreadable file
    }
  }

  stampedReports.sort((a, b) => b.mtimeMs - a.mtimeMs)
  const retained = stampedReports.slice(0, keepRecent)
  const pruned = stampedReports.slice(keepRecent)
  for (const item of pruned) {
    rmSync(item.path, { force: true })
  }
  return {
    retainedRunIds: retained.map((item) => item.runId),
    prunedRunIds: pruned.map((item) => item.runId),
    prunedReports: pruned.length,
  }
}

function main() {
  const runId = `gate_trio_summary_${new Date().toISOString().replace(/[:.]/g, '-')}`
  const maxReportAgeSec = parseSummaryMaxReportAgeSec()
  const keepRecent = parseSummaryKeepRecent()

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

  const mainlineRunDir = join(process.cwd(), 'tmp', 'gates', 'ai-mainline-stability')
  const templateReplayRunDir = join(process.cwd(), 'tmp', 'gates', 'ai-ops-template-replay')

  const sessionAgeSec = resolveAgeSeconds(session.data.generatedAt, session.mtimeIso)
  const mainlineAgeSec = resolveAgeSeconds(mainline.data.generatedAt, mainline.mtimeIso)
  const nightlyAgeSec = resolveAgeSeconds(nightly.data.generatedAt, nightly.mtimeIso)
  const templateReplayAgeSec = resolveAgeSeconds(templateReplay.data.generatedAt, templateReplay.mtimeIso)
  const saveSlotsRestoreApplyAgeSec =
    saveSlotsRestoreApply?.data && saveSlotsRestoreApply.mtimeIso
      ? resolveAgeSeconds(saveSlotsRestoreApply.data.generatedAt, saveSlotsRestoreApply.mtimeIso)
      : null

  const nightlyMainlineReference = resolveStampedRunFreshness(
    mainlineRunDir,
    nightly.data.mainlineGate?.runId,
    maxReportAgeSec,
  )
  const nightlyTemplateReplayReference = resolveStampedRunFreshness(
    templateReplayRunDir,
    nightly.data.templateReplayGate?.runId,
    maxReportAgeSec,
  )

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

  const freshnessItems = [
    buildFreshnessTriageItem({
      report: 'sessionSecurity',
      checkName: 'session_security_report_fresh',
      runId: session.data.runId,
      generatedAt: session.data.generatedAt,
      ageSec: sessionAgeSec,
      maxAgeSec: maxReportAgeSec,
    }),
    buildFreshnessTriageItem({
      report: 'mainline',
      checkName: 'mainline_report_fresh',
      runId: mainline.data.runId,
      generatedAt: mainline.data.generatedAt,
      ageSec: mainlineAgeSec,
      maxAgeSec: maxReportAgeSec,
    }),
    buildFreshnessTriageItem({
      report: 'nightly',
      checkName: 'nightly_report_fresh',
      runId: nightly.data.runId,
      generatedAt: nightly.data.generatedAt,
      ageSec: nightlyAgeSec,
      maxAgeSec: maxReportAgeSec,
    }),
    buildFreshnessTriageItem({
      report: 'templateReplay',
      checkName: 'template_replay_report_fresh',
      runId: templateReplay.data.runId,
      generatedAt: templateReplay.data.generatedAt,
      ageSec: templateReplayAgeSec,
      maxAgeSec: maxReportAgeSec,
    }),
    buildFreshnessTriageItem({
      report: 'saveSlotsRestoreApply',
      checkName: 'save_slots_restore_apply_report_fresh',
      runId: saveSlotsRestoreApply?.data.runId,
      generatedAt: saveSlotsRestoreApply?.data.generatedAt,
      ageSec: saveSlotsRestoreApplyAgeSec,
      maxAgeSec: maxReportAgeSec,
    }),
  ]
  const freshnessMap = new Map(freshnessItems.map((item) => [item.checkName, item] as const))
  const staleFreshnessItems = freshnessItems.filter((item) => item.stale)
  const highestFreshnessSeverity = freshnessItems.reduce<FreshnessSeverity>((acc, item) => {
    return freshnessSeverityRank(item.severity) > freshnessSeverityRank(acc) ? item.severity : acc
  }, 'fresh')

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
      passed: nightly.data.mainlineGate?.runId === mainline.data.runId || nightlyMainlineReference.fresh,
      details: {
        nightlyRunId: nightly.data.mainlineGate?.runId,
        latestRunId: mainline.data.runId,
        referenceFresh: nightlyMainlineReference.fresh,
        referenceExists: nightlyMainlineReference.exists,
        referenceAgeSec: nightlyMainlineReference.ageSec,
      },
    },
    {
      name: 'nightly_references_latest_session_security',
      passed: nightly.data.sessionSecurityGate?.runId === session.data.runId,
      details: { nightlyRunId: nightly.data.sessionSecurityGate?.runId, latestRunId: session.data.runId },
    },
    {
      name: 'nightly_references_latest_template_replay',
      passed: nightly.data.templateReplayGate?.runId === templateReplay.data.runId || nightlyTemplateReplayReference.fresh,
      details: {
        nightlyRunId: nightly.data.templateReplayGate?.runId,
        latestRunId: templateReplay.data.runId,
        referenceFresh: nightlyTemplateReplayReference.fresh,
        referenceExists: nightlyTemplateReplayReference.exists,
        referenceAgeSec: nightlyTemplateReplayReference.ageSec,
      },
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
    {
      name: 'session_security_report_fresh',
      passed: freshnessMap.get('session_security_report_fresh')?.passed === true,
      details: {
        ageSec: sessionAgeSec,
        maxAgeSec: maxReportAgeSec,
        generatedAt: session.data.generatedAt,
        stale: freshnessMap.get('session_security_report_fresh')?.stale,
        severity: freshnessMap.get('session_security_report_fresh')?.severity,
        overdueSec: freshnessMap.get('session_security_report_fresh')?.overdueSec,
        troubleshooting: freshnessMap.get('session_security_report_fresh')?.troubleshooting,
      },
    },
    {
      name: 'mainline_report_fresh',
      passed: freshnessMap.get('mainline_report_fresh')?.passed === true,
      details: {
        ageSec: mainlineAgeSec,
        maxAgeSec: maxReportAgeSec,
        generatedAt: mainline.data.generatedAt,
        stale: freshnessMap.get('mainline_report_fresh')?.stale,
        severity: freshnessMap.get('mainline_report_fresh')?.severity,
        overdueSec: freshnessMap.get('mainline_report_fresh')?.overdueSec,
        troubleshooting: freshnessMap.get('mainline_report_fresh')?.troubleshooting,
      },
    },
    {
      name: 'nightly_report_fresh',
      passed: freshnessMap.get('nightly_report_fresh')?.passed === true,
      details: {
        ageSec: nightlyAgeSec,
        maxAgeSec: maxReportAgeSec,
        generatedAt: nightly.data.generatedAt,
        stale: freshnessMap.get('nightly_report_fresh')?.stale,
        severity: freshnessMap.get('nightly_report_fresh')?.severity,
        overdueSec: freshnessMap.get('nightly_report_fresh')?.overdueSec,
        troubleshooting: freshnessMap.get('nightly_report_fresh')?.troubleshooting,
      },
    },
    {
      name: 'template_replay_report_fresh',
      passed: freshnessMap.get('template_replay_report_fresh')?.passed === true,
      details: {
        ageSec: templateReplayAgeSec,
        maxAgeSec: maxReportAgeSec,
        generatedAt: templateReplay.data.generatedAt,
        stale: freshnessMap.get('template_replay_report_fresh')?.stale,
        severity: freshnessMap.get('template_replay_report_fresh')?.severity,
        overdueSec: freshnessMap.get('template_replay_report_fresh')?.overdueSec,
        troubleshooting: freshnessMap.get('template_replay_report_fresh')?.troubleshooting,
      },
    },
    {
      name: 'save_slots_restore_apply_report_fresh',
      passed: freshnessMap.get('save_slots_restore_apply_report_fresh')?.passed === true,
      details: {
        ageSec: saveSlotsRestoreApplyAgeSec,
        maxAgeSec: maxReportAgeSec,
        generatedAt: saveSlotsRestoreApply?.data.generatedAt,
        stale: freshnessMap.get('save_slots_restore_apply_report_fresh')?.stale,
        severity: freshnessMap.get('save_slots_restore_apply_report_fresh')?.severity,
        overdueSec: freshnessMap.get('save_slots_restore_apply_report_fresh')?.overdueSec,
        troubleshooting: freshnessMap.get('save_slots_restore_apply_report_fresh')?.troubleshooting,
      },
    },
  ]

  const overallPassed = checks.every((item) => item.passed)

  const report: GateTrioSummaryReport = {
    runId,
    generatedAt: new Date().toISOString(),
    overallPassed,
    policy: {
      maxReportAgeSec,
      keepRecent,
    },
    freshnessTriage: {
      staleDetected: staleFreshnessItems.length > 0,
      staleCount: staleFreshnessItems.length,
      highestSeverity: highestFreshnessSeverity,
      primaryRecommendation: staleFreshnessItems.length > 0 ? 'npm run gate:ai:trio' : undefined,
      standaloneSummaryCommand: 'npm run gate:ai:trio:summary',
      items: freshnessItems,
    },
    reports: {
      sessionSecurity: {
        path: sessionPath,
        runId: session.data.runId,
        passed: session.data.passed,
        generatedAt: session.data.generatedAt,
        ageSec: sessionAgeSec,
        failedChecks: sessionFailedChecks,
      },
      mainline: {
        path: mainlinePath,
        runId: mainline.data.runId,
        passed: mainline.data.passed,
        generatedAt: mainline.data.generatedAt,
        ageSec: mainlineAgeSec,
        failedChecks: mainlineFailedChecks,
        templateReplayRunId: mainline.data.templateReplay?.runId,
      },
      nightly: {
        path: nightlyPath,
        runId: nightly.data.runId,
        passed: nightly.data.passed,
        generatedAt: nightly.data.generatedAt,
        ageSec: nightlyAgeSec,
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
        ageSec: templateReplayAgeSec,
        failedChecks: templateReplayFailedChecks,
        requiredFailedSteps: templateReplayRequiredFailedSteps,
        allStepsRequired: templateReplayAllStepsRequired,
      },
      saveSlotsRestoreApply: {
        path: saveSlotsRestoreApplyPath,
        runId: saveSlotsRestoreApply?.data.runId ?? 'missing',
        passed: saveSlotsRestoreApply?.data.passed === true,
        generatedAt: saveSlotsRestoreApply?.data.generatedAt,
        ageSec: saveSlotsRestoreApplyAgeSec,
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
  const writeReport = (target: GateTrioSummaryReport) => {
    const payload = JSON.stringify(target, null, 2)
    writeFileSync(latestPath, payload, 'utf8')
    writeFileSync(stampedPath, payload, 'utf8')
  }
  writeReport(report)
  report.artifacts = pruneSummaryReports(runDir, keepRecent)
  writeReport(report)

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
