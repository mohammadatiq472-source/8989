import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'

type FreshnessSeverity = 'fresh' | 'stale_notice' | 'stale_warning' | 'stale_high' | 'stale_critical' | 'unknown'

type FreshnessTriageItem = {
  report?: string
  checkName?: string
  runId?: string
  ageSec?: number | null
  maxAgeSec?: number
  overdueSec?: number | null
  passed?: boolean
  stale?: boolean
  severity?: FreshnessSeverity
  troubleshooting?: {
    primaryCommand?: string
    componentRefreshCommand?: string
    rerunSummaryCommand?: string
    note?: string
  }
}

type GateCheck = {
  name?: string
  passed?: boolean
  details?: unknown
}

type GateTrioSummaryReport = {
  runId?: string
  generatedAt?: string
  overallPassed?: boolean
  policy?: {
    maxReportAgeSec?: number
    keepRecent?: number
  }
  freshnessTriage?: {
    staleDetected?: boolean
    staleCount?: number
    highestSeverity?: FreshnessSeverity
    primaryRecommendation?: string
    standaloneSummaryCommand?: string
    items?: FreshnessTriageItem[]
  }
  checks?: GateCheck[]
}

type PrAutoCommentStatus = 'unknown' | 'posted' | 'updated' | 'skipped' | 'failed'

type CliOptions = {
  summaryPath: string
  outputPath?: string
  prAutoPromptOutputPath?: string
  prAutoCommentStatus: PrAutoCommentStatus
  prAutoCommentReason: string
  ciOutcome: 'success' | 'failure' | 'cancelled' | 'skipped' | 'unknown'
}

type RenderSummaryResult = {
  markdown: string
  prAutoPromptMarkdown?: string
}

type ReconcileStatusSeverity = 'info' | 'warning' | 'error'

type ReconcileStatusMeta = {
  label: string
  severity: ReconcileStatusSeverity
  action: string
}

function parseCliOptions(argv: string[]): CliOptions {
  let summaryPath = 'tmp/gates/gate-trio/gate_trio_summary_latest.json'
  let outputPath: string | undefined
  let prAutoPromptOutputPath: string | undefined
  let prAutoCommentStatus: PrAutoCommentStatus = 'unknown'
  let prAutoCommentReason = 'not_attempted'
  let ciOutcome: CliOptions['ciOutcome'] = 'unknown'
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--summary-path') {
      summaryPath = argv[i + 1] ?? summaryPath
      i += 1
      continue
    }
    if (token === '--output') {
      outputPath = argv[i + 1]
      i += 1
      continue
    }
    if (token === '--pr-auto-prompt-output') {
      prAutoPromptOutputPath = argv[i + 1]
      i += 1
      continue
    }
    if (token === '--pr-auto-comment-status') {
      const raw = (argv[i + 1] ?? '').toLowerCase()
      i += 1
      if (raw === 'unknown' || raw === 'posted' || raw === 'updated' || raw === 'skipped' || raw === 'failed') {
        prAutoCommentStatus = raw
      }
      continue
    }
    if (token === '--pr-auto-comment-reason') {
      prAutoCommentReason = argv[i + 1] ?? prAutoCommentReason
      i += 1
      continue
    }
    if (token === '--ci-outcome') {
      const raw = (argv[i + 1] ?? '').toLowerCase()
      i += 1
      if (raw === 'success' || raw === 'failure' || raw === 'cancelled' || raw === 'skipped') {
        ciOutcome = raw
      }
    }
  }
  return {
    summaryPath,
    outputPath,
    prAutoPromptOutputPath,
    prAutoCommentStatus,
    prAutoCommentReason,
    ciOutcome,
  }
}

function escapeCell(value: string | number | boolean | null | undefined) {
  if (value === null || value === undefined) {
    return '-'
  }
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

function severityRank(severity: FreshnessSeverity | undefined) {
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

function stringifyDetails(details: unknown) {
  if (!details || typeof details !== 'object') {
    return '-'
  }
  try {
    const json = JSON.stringify(details)
    return json.length <= 280 ? json : `${json.slice(0, 277)}...`
  } catch {
    return '[unserializable details]'
  }
}

function toFreshnessRows(items: FreshnessTriageItem[]) {
  const prioritized = [...items].sort((a, b) => {
    const staleA = a.stale === true ? 1 : 0
    const staleB = b.stale === true ? 1 : 0
    if (staleA !== staleB) {
      return staleB - staleA
    }
    const rankDiff = severityRank(b.severity) - severityRank(a.severity)
    if (rankDiff !== 0) {
      return rankDiff
    }
    const overdueA = typeof a.overdueSec === 'number' ? a.overdueSec : -1
    const overdueB = typeof b.overdueSec === 'number' ? b.overdueSec : -1
    return overdueB - overdueA
  })
  return prioritized.map((item) => {
    return `| ${escapeCell(item.checkName)} | ${escapeCell(item.severity)} | ${escapeCell(item.ageSec)} | ${escapeCell(item.maxAgeSec)} | ${escapeCell(item.overdueSec)} | ${escapeCell(item.runId)} | ${escapeCell(item.troubleshooting?.componentRefreshCommand)} |`
  })
}

function toTemplateRows(items: FreshnessTriageItem[]) {
  const prioritized = [...items].sort((a, b) => {
    const staleA = a.stale === true ? 1 : 0
    const staleB = b.stale === true ? 1 : 0
    if (staleA !== staleB) {
      return staleB - staleA
    }
    const rankDiff = severityRank(b.severity) - severityRank(a.severity)
    if (rankDiff !== 0) {
      return rankDiff
    }
    const overdueA = typeof a.overdueSec === 'number' ? a.overdueSec : -1
    const overdueB = typeof b.overdueSec === 'number' ? b.overdueSec : -1
    return overdueB - overdueA
  })
  return prioritized.map((item) => {
    return `| ${escapeCell(item.checkName)} | ${escapeCell(item.severity)} | ${escapeCell(item.overdueSec)} | ${escapeCell(item.troubleshooting?.componentRefreshCommand)} |`
  })
}

function toFailedCheckRows(checks: GateCheck[]) {
  return checks
    .filter((item) => item.passed !== true)
    .map((item) => `| ${escapeCell(item.name)} | ${escapeCell(stringifyDetails(item.details))} |`)
}

function isHighRiskSeverity(severity: FreshnessSeverity | undefined) {
  return severity === 'stale_high' || severity === 'stale_critical' || severity === 'unknown'
}

function toPrAutoCommentOutcomeLabel(status: PrAutoCommentStatus, reason: string): string {
  if (status === 'posted') {
    return 'auto_comment_posted'
  }
  if (status === 'updated') {
    return 'auto_comment_updated'
  }
  if (status === 'skipped') {
    return `auto_comment_skipped:${reason || 'unknown'}`
  }
  if (status === 'failed') {
    return `auto_comment_failed:${reason || 'unknown'}`
  }
  return `auto_comment_unknown:${reason || 'unknown'}`
}

function getPrAutoCommentStatusMeta(status: PrAutoCommentStatus, reason: string): ReconcileStatusMeta {
  if (status === 'posted') {
    return {
      label: '已自动发布 PR 评论',
      severity: 'info',
      action: '直接在 PR 讨论区确认机器人评论内容，并继续执行 immediateAction。',
    }
  }
  if (status === 'updated') {
    return {
      label: '已自动更新现有 PR 评论',
      severity: 'info',
      action: '直接在 PR 讨论区确认最新评论内容，并继续执行 immediateAction。',
    }
  }
  if (status === 'skipped') {
    if (reason === 'fork_permission_restricted') {
      return {
        label: '已降级为手工粘贴（fork/跨仓权限受限）',
        severity: 'warning',
        action: '从 Step Summary 复制 `PR Auto Prompt (Failure/High-Risk)` 到 PR 描述或评论区，并回填对账字段。',
      }
    }
    if (reason === 'manual_override') {
      return {
        label: '已按人工覆盖模式跳过自动评论',
        severity: 'warning',
        action: '继续使用 PR 模板中的手工粘贴区，并回填对账字段。',
      }
    }
    if (reason === 'not_pull_request') {
      return {
        label: '当前不是 PR 事件，自动评论未启用',
        severity: 'info',
        action: '保留 Step Summary / artifact 作为排障出口；若需要人工同步，再手动粘贴到对应 PR。',
      }
    }
    if (reason === 'no_high_risk_prompt') {
      return {
        label: '未生成高危提示，自动评论无需执行',
        severity: 'info',
        action: '无需补发评论；仅在后续出现 high-risk stale 时再使用自动/手工评论链。',
      }
    }
    return {
      label: `自动评论已跳过（${reason || 'unknown'}）`,
      severity: 'warning',
      action: '查看 Step Summary 的 `PR Auto Comment Reconcile` 并按提示决定是否手工粘贴。',
    }
  }
  if (status === 'failed') {
    if (reason === 'permission_denied') {
      return {
        label: '自动评论发布失败（权限不足）',
        severity: 'error',
        action: '改走手工粘贴路径，并在 PR 中记录 `permission_denied`，避免误判成“已自动通知”。',
      }
    }
    return {
      label: `自动评论发布失败（${reason || 'unknown'}）`,
      severity: 'error',
      action: '查看 workflow 日志后改走手工粘贴路径，并在 PR 中记录失败原因。',
    }
  }
  return {
    label: `自动评论状态未知（${reason || 'unknown'}）`,
    severity: 'warning',
    action: '先查看 Step Summary 的 `PR Auto Comment Reconcile`，再决定是否手工补发。',
  }
}

function renderSummaryMarkdown(
  report: GateTrioSummaryReport,
  summaryPath: string,
  options: Pick<CliOptions, 'ciOutcome' | 'prAutoCommentStatus' | 'prAutoCommentReason'>,
): RenderSummaryResult {
  const triageItems = Array.isArray(report.freshnessTriage?.items) ? report.freshnessTriage.items : []
  const freshnessRows = toFreshnessRows(triageItems)
  const failedCheckRows = toFailedCheckRows(Array.isArray(report.checks) ? report.checks : [])
  const staleItemCount = triageItems.filter(
    (item) => item.stale === true || item.passed === false || item.severity === 'unknown',
  ).length
  const staleTemplateRows = toTemplateRows(
    triageItems.filter((item) => item.stale === true || item.passed === false || item.severity === 'unknown'),
  )
  const defaultTemplateRows = toTemplateRows(triageItems.slice(0, 5))
  const staleCount = typeof report.freshnessTriage?.staleCount === 'number' ? report.freshnessTriage.staleCount : staleItemCount
  const staleDetected = report.freshnessTriage?.staleDetected === true || staleCount > 0
  const resolvedCiOutcome =
    options.ciOutcome !== 'unknown'
      ? options.ciOutcome
      : report.overallPassed === false || failedCheckRows.length > 0
        ? 'failure'
        : 'success'
  const primaryCommand = report.freshnessTriage?.primaryRecommendation ?? 'npm run gate:ai:trio'
  const summaryCommand = report.freshnessTriage?.standaloneSummaryCommand ?? 'npm run gate:ai:trio:summary'
  const highRiskItems = triageItems.filter((item) => item.stale === true && isHighRiskSeverity(item.severity))
  const highRiskTemplateRows = toTemplateRows(highRiskItems)
  const highRiskCheckNames = highRiskItems
    .map((item) => item.checkName)
    .filter((name): name is string => typeof name === 'string' && name.length > 0)
  const reconcileStatusMeta = getPrAutoCommentStatusMeta(options.prAutoCommentStatus, options.prAutoCommentReason)
  const reconcileOutcomeLabel = toPrAutoCommentOutcomeLabel(options.prAutoCommentStatus, options.prAutoCommentReason)
  let prAutoPromptMarkdown: string | undefined

  const lines: string[] = []
  lines.push('## Gate Trio Failure Summary (CI/PR)')
  lines.push('')
  lines.push(`- Summary file: \`${summaryPath}\``)
  lines.push(`- Summary runId: \`${escapeCell(report.runId)}\``)
  lines.push(`- GeneratedAt: \`${escapeCell(report.generatedAt)}\``)
  lines.push(`- overallPassed: \`${escapeCell(report.overallPassed)}\``)
  lines.push(`- freshness.staleDetected: \`${escapeCell(staleDetected)}\``)
  lines.push(`- freshness.staleCount: \`${escapeCell(staleCount)}\``)
  lines.push(`- freshness.highestSeverity: \`${escapeCell(report.freshnessTriage?.highestSeverity)}\``)
  lines.push(`- policy.maxReportAgeSec: \`${escapeCell(report.policy?.maxReportAgeSec)}\``)
  lines.push(`- policy.keepRecent: \`${escapeCell(report.policy?.keepRecent)}\``)
  lines.push(`- ciOutcome: \`${escapeCell(resolvedCiOutcome)}\``)
  lines.push(`- highRiskStaleCount: \`${escapeCell(highRiskItems.length)}\``)
  lines.push(`- prAutoCommentStatus: \`${escapeCell(options.prAutoCommentStatus)}\``)
  lines.push(`- prAutoCommentReason: \`${escapeCell(options.prAutoCommentReason)}\``)
  lines.push(`- prAutoCommentOutcome: \`${escapeCell(reconcileOutcomeLabel)}\``)
  lines.push(`- prAutoCommentLabel: ${reconcileStatusMeta.label}`)
  lines.push(`- prAutoCommentNextAction: ${reconcileStatusMeta.action}`)
  lines.push('')
  lines.push('### Freshness Triage')
  lines.push('| Check | Severity | AgeSec | MaxSec | OverdueSec | RunId | Component Refresh Command |')
  lines.push('| --- | --- | --- | --- | --- | --- | --- |')
  if (freshnessRows.length > 0) {
    lines.push(...freshnessRows)
  } else {
    lines.push('| - | - | - | - | - | - | - |')
  }
  lines.push('')
  lines.push('### Failed Checks')
  lines.push('| Check | Details |')
  lines.push('| --- | --- |')
  if (failedCheckRows.length > 0) {
    lines.push(...failedCheckRows)
  } else {
    lines.push('| - | none |')
  }
  lines.push('')
  lines.push('### PR Failure Summary Template (Copy/Paste)')
  lines.push('```markdown')
  lines.push('### Gate Trio Failure Snapshot')
  lines.push(`- summaryRunId: \`${escapeCell(report.runId)}\``)
  lines.push(`- overallPassed: \`${escapeCell(report.overallPassed)}\``)
  lines.push(`- staleDetected: \`${escapeCell(staleDetected)}\``)
  lines.push(`- staleCount: \`${escapeCell(staleCount)}\``)
  lines.push(`- highestSeverity: \`${escapeCell(report.freshnessTriage?.highestSeverity)}\``)
  lines.push(`- primaryRecommendation: \`${escapeCell(primaryCommand)}\``)
  lines.push(`- prAutoCommentStatus: \`${escapeCell(options.prAutoCommentStatus)}\``)
  lines.push(`- prAutoCommentReason: \`${escapeCell(options.prAutoCommentReason)}\``)
  lines.push(`- prAutoCommentOutcome: \`${escapeCell(reconcileOutcomeLabel)}\``)
  lines.push('')
  lines.push('#### freshnessTriage.items (stale first)')
  lines.push('| checkName | severity | overdueSec | componentRefreshCommand |')
  lines.push('| --- | --- | --- | --- |')
  if (staleTemplateRows.length > 0) {
    lines.push(...staleTemplateRows)
  } else if (defaultTemplateRows.length > 0) {
    lines.push(...defaultTemplateRows)
  } else {
    lines.push('| - | - | - | - |')
  }
  lines.push('')
  lines.push('#### Next Actions')
  lines.push(`1. \`${escapeCell(primaryCommand)}\``)
  lines.push('2. 仅定位局部问题时，执行上表 `componentRefreshCommand`。')
  lines.push(`3. \`${escapeCell(summaryCommand)}\` 复核摘要。`)
  lines.push('```')

  if (resolvedCiOutcome === 'failure' && highRiskItems.length > 0) {
    const prAutoPromptLines = [
      '<!-- ai-trio-gate:auto-comment:failure-high-risk -->',
      '⚠️ `ai-trio-gate` 自动提示：检测到高危陈旧报告（stale_high/stale_critical/unknown）。',
      `- summaryRunId: \`${escapeCell(report.runId)}\``,
      `- highestSeverity: \`${escapeCell(report.freshnessTriage?.highestSeverity)}\``,
      `- highRiskChecks: \`${escapeCell(highRiskCheckNames.join(', ') || 'unknown')}\``,
      `- immediateAction: \`${escapeCell(primaryCommand)}\``,
      `- autoCommentOutcome: \`${escapeCell(reconcileOutcomeLabel)}\``,
      `- autoCommentLabel: ${reconcileStatusMeta.label}`,
      `- autoCommentNextAction: ${reconcileStatusMeta.action}`,
      '请先执行 immediateAction 并更新 Gate Trio Failure Snapshot。',
      '- actionStatus: pending',
    ]
    prAutoPromptMarkdown = prAutoPromptLines.join('\n')

    lines.push('')
    lines.push('### :red_circle: STALE HIGH-RISK HIGHLIGHT (Auto)')
    lines.push('- CI 检测到高危陈旧分级（`stale_high/stale_critical/unknown`），请优先按主链刷新。')
    lines.push(`- highRiskChecks: \`${escapeCell(highRiskCheckNames.join(', ') || 'unknown')}\``)
    lines.push(`- immediateAction: \`${escapeCell(primaryCommand)}\``)
    lines.push(`- autoCommentOutcome: \`${escapeCell(reconcileOutcomeLabel)}\``)
    lines.push(`- autoCommentLabel: ${reconcileStatusMeta.label}`)
    lines.push(`- autoCommentNextAction: ${reconcileStatusMeta.action}`)
    lines.push('| checkName | severity | overdueSec | componentRefreshCommand |')
    lines.push('| --- | --- | --- | --- |')
    lines.push(...highRiskTemplateRows)
    lines.push('')
    lines.push('### PR Auto Prompt (Failure/High-Risk)')
    lines.push('```markdown')
    lines.push(...prAutoPromptLines.filter((line) => !line.startsWith('<!-- ai-trio-gate:')))
    lines.push('```')
  }
  return { markdown: lines.join('\n'), prAutoPromptMarkdown }
}

function renderMissingSummaryMarkdown(summaryPath: string) {
  const lines: string[] = []
  lines.push('## Gate Trio Failure Summary (CI/PR)')
  lines.push('')
  lines.push(`- Summary file missing: \`${summaryPath}\``)
  lines.push('- 无法映射 `freshnessTriage`，请先执行完整门禁链。')
  lines.push('')
  lines.push('### Next Actions')
  lines.push('1. `npm run gate:ai:trio`')
  lines.push('2. `npm run gate:ai:trio:summary`')
  return lines.join('\n')
}

function main() {
  const options = parseCliOptions(process.argv.slice(2))
  const summaryPath = resolve(process.cwd(), options.summaryPath)
  let markdown: string
  let prAutoPromptMarkdown = ''
  if (existsSync(summaryPath)) {
    const rendered = renderSummaryMarkdown(
      JSON.parse(readFileSync(summaryPath, 'utf8')) as GateTrioSummaryReport,
      summaryPath,
      {
        ciOutcome: options.ciOutcome,
        prAutoCommentStatus: options.prAutoCommentStatus,
        prAutoCommentReason: options.prAutoCommentReason,
      },
    )
    markdown = rendered.markdown
    prAutoPromptMarkdown = rendered.prAutoPromptMarkdown ?? ''
  } else {
    markdown = renderMissingSummaryMarkdown(summaryPath)
  }

  if (options.outputPath) {
    const outputPath = resolve(process.cwd(), options.outputPath)
    mkdirSync(dirname(outputPath), { recursive: true })
    writeFileSync(outputPath, markdown, 'utf8')
  }
  if (options.prAutoPromptOutputPath) {
    const promptPath = resolve(process.cwd(), options.prAutoPromptOutputPath)
    mkdirSync(dirname(promptPath), { recursive: true })
    writeFileSync(promptPath, prAutoPromptMarkdown, 'utf8')
  }

  console.info(markdown)
}

try {
  main()
} catch (error) {
  const message = error instanceof Error ? error.message : 'failed to render trio failure summary'
  console.error(message)
  process.exit(1)
}
