import {
  AI_PLAYER_AUTHORITY_DECISIONS,
  AI_PLAYER_BACKEND_VERSION_CONTROL_SCOPE,
  AI_PLAYER_KNOWLEDGE_GRAPH_VERSION,
  AI_PLAYER_PROMOTED_V1_ACTION_KNOWLEDGE,
  type AiPlayerKnowledgeGraphQuery,
  type AiPlayerKnowledgeGraphSnapshot,
} from '../../../../shared/contracts/aiPlayerKnowledgeGraph'
import { listStaticAiPlayerActionCatalog } from './aiPlayerActionCatalog'

function normalizeOptionalString(value: string | undefined): string | undefined {
  const normalized = value?.trim()
  return normalized && normalized.length > 0 ? normalized : undefined
}

function matchesPromotedAction(
  aiAction: string,
  worldAction: string,
  query: Pick<AiPlayerKnowledgeGraphQuery, 'aiAction' | 'worldAction'>,
): boolean {
  if (query.aiAction && query.aiAction !== aiAction) {
    return false
  }
  if (query.worldAction && query.worldAction !== worldAction) {
    return false
  }
  return true
}

export function buildAiPlayerKnowledgeGraphSnapshot(query: AiPlayerKnowledgeGraphQuery = {}): AiPlayerKnowledgeGraphSnapshot {
  const aiAction = query.aiAction
  const worldAction = normalizeOptionalString(query.worldAction)
  const includeCatalog = query.includeCatalog !== false
  const includePromotedActions = query.recommendation !== 'defer'

  const promotedActions = includePromotedActions
    ? AI_PLAYER_PROMOTED_V1_ACTION_KNOWLEDGE.filter((item) => matchesPromotedAction(item.aiAction, item.worldAction, { aiAction, worldAction }))
    : []
  const authorityDecisions = AI_PLAYER_AUTHORITY_DECISIONS.filter((item) => {
      if (worldAction && item.worldAction !== worldAction) {
        return false
      }
      if (query.recommendation && item.recommendation !== query.recommendation) {
        return false
      }
      if (aiAction && item.suggestedAiAction !== aiAction) {
        return false
      }
      return true
    })
  const executableCatalog = includeCatalog && includePromotedActions
    ? listStaticAiPlayerActionCatalog().filter((item) => !aiAction || item.action === aiAction)
    : []

  return {
    version: AI_PLAYER_KNOWLEDGE_GRAPH_VERSION,
    exportedAt: new Date().toISOString(),
    query: {
      aiAction: aiAction ?? null,
      worldAction: worldAction ?? null,
      recommendation: query.recommendation ?? null,
      includeCatalog,
    },
    promotedActions,
    authorityDecisions,
    versionControlScope: AI_PLAYER_BACKEND_VERSION_CONTROL_SCOPE,
    executableCatalog,
    counts: {
      promotedActions: promotedActions.length,
      authorityDecisions: authorityDecisions.length,
      versionControlScope: AI_PLAYER_BACKEND_VERSION_CONTROL_SCOPE.length,
      executableCatalog: executableCatalog.length,
    },
  }
}

function renderQueryValue(value: string | boolean | null): string {
  if (value === null) {
    return '`null`'
  }
  if (typeof value === 'boolean') {
    return value ? '`true`' : '`false`'
  }
  return `\`${value}\``
}

export function renderAiPlayerKnowledgeGraphObsidian(snapshot: AiPlayerKnowledgeGraphSnapshot): string {
  const lines: string[] = [
    '---',
    'kind: ai-player-knowledge-graph',
    `version: ${snapshot.version}`,
    `exportedAt: ${snapshot.exportedAt}`,
    'source: shared/contracts/aiPlayerKnowledgeGraph.ts',
    '---',
    '# AI Player Backend Knowledge Graph',
    '',
    'Obsidian 可以用来沉淀和检索这份图谱，但单一事实源仍然是仓库内的 TypeScript contract 与后端 API/MCP 读面。',
    '',
    '## Query',
    `- aiAction: ${renderQueryValue(snapshot.query.aiAction)}`,
    `- worldAction: ${renderQueryValue(snapshot.query.worldAction)}`,
    `- recommendation: ${renderQueryValue(snapshot.query.recommendation)}`,
    `- includeCatalog: ${renderQueryValue(snapshot.query.includeCatalog)}`,
    '',
    '## Promoted V1 Actions',
  ]

  if (snapshot.promotedActions.length === 0) {
    lines.push('- No promoted v1 actions matched the current filter.')
  } else {
    for (const item of snapshot.promotedActions) {
      lines.push(`### ${item.aiAction} -> ${item.worldAction}`)
      lines.push(`- Summary: ${item.semanticSummary}`)
      lines.push(`- Verify: ${item.verificationCommands.map((command) => `\`${command}\``).join(' ; ')}`)
      for (const note of item.criticalNotes) {
        lines.push(`- Note: ${note}`)
      }
      lines.push('')
    }
    if (lines[lines.length - 1] === '') {
      lines.pop()
    }
  }

  lines.push('', '## Authority Decisions')
  if (snapshot.authorityDecisions.length === 0) {
    lines.push('- No authority decisions matched the current filter.')
  } else {
    for (const item of snapshot.authorityDecisions) {
      lines.push(`### ${item.worldAction}`)
      lines.push(`- Recommendation: \`${item.recommendation}\``)
      lines.push(`- Suggested AI action: ${item.suggestedAiAction ? `\`${item.suggestedAiAction}\`` : '`null`'}`)
      lines.push(`- Rationale: ${item.rationale}`)
      if (item.blockers && item.blockers.length > 0) {
        lines.push('- Blocking decisions:')
        for (const blocker of item.blockers) {
          lines.push(`  - \`${blocker.id}\`: ${blocker.question}`)
          lines.push(`    - User confirmation: ${blocker.requiresUserConfirmation ? '`true`' : '`false`'}`)
          lines.push(`    - Recommended default: ${blocker.recommendedDefault}`)
          lines.push(`    - Unblocks: ${blocker.unblocks}`)
        }
      }
      lines.push('')
    }
    if (lines[lines.length - 1] === '') {
      lines.pop()
    }
  }

  lines.push('', '## Version Control Scope')
  for (const item of snapshot.versionControlScope) {
    lines.push(`- \`${item.path}\` - ${item.role} Review: ${item.reviewExpectation}`)
  }

  lines.push('', '## Executable Catalog')
  if (snapshot.executableCatalog.length === 0) {
    lines.push('- Catalog omitted or no executable actions matched the current filter.')
  } else {
    for (const item of snapshot.executableCatalog) {
      lines.push(`- \`${item.action}\` -> \`${item.mappedWorldAction ?? 'null'}\` | v1=${item.executableInV1 ? 'true' : 'false'}`)
    }
  }

  return lines.join('\n')
}
