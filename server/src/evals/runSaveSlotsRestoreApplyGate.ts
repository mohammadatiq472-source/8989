import { copyFileSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { basename, join } from 'node:path'
import { gzipSync } from 'node:zlib'

type RestoreApplyGateCheck = {
  name: string
  passed: boolean
  details?: Record<string, unknown>
}

type SaveSlotsRestoreApplyGateReport = {
  runId: string
  generatedAt: string
  checks: RestoreApplyGateCheck[]
  passed: boolean
  source: {
    savePath: string
    archiveDir: string
    archivePath: string | null
    archiveSourceMode: 'copied_latest' | 'generated_from_save' | 'missing'
  }
  isolated: {
    root: string
    savePath: string
    archiveDir: string
    selectedArchivePath: string | null
  }
  restore: {
    firstStatus: string | null
    secondStatus: string | null
    thirdStatus: string | null
    firstMessage?: string
    secondMessage?: string
    thirdMessage?: string
  }
  health: {
    restoreApplySuccessCount: number | null
    restoreApplyFailureCount: number | null
    lastRestoreApplyStatus: string | null
    lastRestoreApplyArchivePath: string | null
    lastRestoreApplyBackupPath: string | null
  }
  artifacts?: {
    keepRecent: number
    retainedRunIds: string[]
    prunedRunIds: string[]
    prunedReports: number
    prunedWorkspaces: number
  }
  error?: string
}

function createRunContext() {
  const runId = `save_slots_restore_apply_${new Date().toISOString().replace(/[:.]/g, '-')}`
  const runDir = join(process.cwd(), 'tmp', 'gates', 'save-slots-restore-apply-gate')
  mkdirSync(runDir, { recursive: true })
  return { runId, runDir }
}

function persistReport(runDir: string, runId: string, report: SaveSlotsRestoreApplyGateReport) {
  const latestPath = join(runDir, 'save_slots_restore_apply_gate_latest.json')
  const stampedPath = join(runDir, `${runId}.json`)
  const payload = JSON.stringify(report, null, 2)
  writeFileSync(latestPath, payload, 'utf8')
  writeFileSync(stampedPath, payload, 'utf8')
}

function parseKeepRecentArtifacts() {
  const raw = Number(process.env.SAVE_SLOTS_RESTORE_APPLY_GATE_KEEP_RECENT ?? '12')
  if (!Number.isFinite(raw)) {
    return 12
  }
  return Math.max(1, Math.min(200, Math.floor(raw)))
}

function pruneHistoricalArtifacts(runDir: string, keepRecent: number) {
  const stampedReports: Array<{ runId: string; path: string; mtimeMs: number }> = []
  const workspaceDirs: Array<{ runId: string; path: string }> = []

  for (const name of readdirSync(runDir)) {
    const fullPath = join(runDir, name)
    let stat
    try {
      stat = statSync(fullPath)
    } catch {
      continue
    }
    if (stat.isFile() && name !== 'save_slots_restore_apply_gate_latest.json') {
      if (!name.startsWith('save_slots_restore_apply_') || !name.endsWith('.json')) {
        continue
      }
      const runId = name.slice(0, -'.json'.length)
      stampedReports.push({ runId, path: fullPath, mtimeMs: stat.mtimeMs })
      continue
    }
    if (stat.isDirectory() && name.startsWith('save_slots_restore_apply_') && name.endsWith('_workspace')) {
      const runId = name.slice(0, -'_workspace'.length)
      workspaceDirs.push({ runId, path: fullPath })
    }
  }

  stampedReports.sort((a, b) => b.mtimeMs - a.mtimeMs)
  const retained = stampedReports.slice(0, keepRecent)
  const pruned = stampedReports.slice(keepRecent)
  const prunedRunIdSet = new Set(pruned.map((item) => item.runId))

  for (const item of pruned) {
    rmSync(item.path, { force: true })
  }

  let prunedWorkspaces = 0
  for (const item of workspaceDirs) {
    if (prunedRunIdSet.has(item.runId)) {
      rmSync(item.path, { recursive: true, force: true })
      prunedWorkspaces += 1
    }
  }

  return {
    keepRecent,
    retainedRunIds: retained.map((item) => item.runId),
    prunedRunIds: pruned.map((item) => item.runId),
    prunedReports: pruned.length,
    prunedWorkspaces,
  }
}

function listArchiveFiles(archiveDir: string) {
  if (!existsSync(archiveDir)) {
    return [] as Array<{ path: string; mtimeMs: number }>
  }
  const files: Array<{ path: string; mtimeMs: number }> = []
  for (const name of readdirSync(archiveDir)) {
    if (!name.startsWith('world_save_slots.') || !name.endsWith('.json.gz')) {
      continue
    }
    const path = join(archiveDir, name)
    try {
      const stat = statSync(path)
      files.push({ path, mtimeMs: stat.mtimeMs })
    } catch {
      // ignore broken files
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs)
  return files
}

async function main() {
  const { runId, runDir } = createRunContext()
  const keepRecentArtifacts = parseKeepRecentArtifacts()
  const checks: RestoreApplyGateCheck[] = []
  const workspaceRoot = process.cwd()
  const sourceSavePath = process.env.WORLD_SAVE_SLOTS_PATH?.trim() || join(workspaceRoot, 'tmp', 'world_save_slots.json')
  const sourceArchiveDir =
    process.env.WORLD_SAVE_SLOTS_ARCHIVE_DIR?.trim() || join(workspaceRoot, 'tmp', 'world_save_slots_archive')
  const isolatedRoot = join(runDir, `${runId}_workspace`)
  const isolatedSavePath = join(isolatedRoot, 'world_save_slots.json')
  const isolatedArchiveDir = join(isolatedRoot, 'world_save_slots_archive')
  mkdirSync(isolatedArchiveDir, { recursive: true })

  let archivePath: string | null = null
  let archiveSourceMode: SaveSlotsRestoreApplyGateReport['source']['archiveSourceMode'] = 'missing'

  const sourceArchives = listArchiveFiles(sourceArchiveDir)
  if (sourceArchives.length > 0) {
    archivePath = join(isolatedArchiveDir, basename(sourceArchives[0].path))
    copyFileSync(sourceArchives[0].path, archivePath)
    archiveSourceMode = 'copied_latest'
  } else if (existsSync(sourceSavePath)) {
    const savePayload = readFileSync(sourceSavePath, 'utf8')
    archivePath = join(isolatedArchiveDir, `world_save_slots.${Date.now()}.json.gz`)
    writeFileSync(archivePath, gzipSync(savePayload))
    archiveSourceMode = 'generated_from_save'
  }

  if (!archivePath) {
    const report: SaveSlotsRestoreApplyGateReport = {
      runId,
      generatedAt: new Date().toISOString(),
      checks: [
        {
          name: 'source_archive_available',
          passed: false,
          details: { sourceSavePath, sourceArchiveDir },
        },
      ],
      passed: false,
      source: {
        savePath: sourceSavePath,
        archiveDir: sourceArchiveDir,
        archivePath: null,
        archiveSourceMode,
      },
      isolated: {
        root: isolatedRoot,
        savePath: isolatedSavePath,
        archiveDir: isolatedArchiveDir,
        selectedArchivePath: null,
      },
      restore: {
        firstStatus: null,
        secondStatus: null,
        thirdStatus: null,
      },
      health: {
        restoreApplySuccessCount: null,
        restoreApplyFailureCount: null,
        lastRestoreApplyStatus: null,
        lastRestoreApplyArchivePath: null,
        lastRestoreApplyBackupPath: null,
      },
      error: 'No source save-slot archive available and source save-slot file missing.',
    }
    persistReport(runDir, runId, report)
    report.artifacts = pruneHistoricalArtifacts(runDir, keepRecentArtifacts)
    persistReport(runDir, runId, report)
    console.error(JSON.stringify(report, null, 2))
    process.exit(1)
  }

  // Seed a divergent active store so restore #1 is deterministically "restored".
  writeFileSync(
    isolatedSavePath,
    JSON.stringify(
      {
        version: 1,
        savedAt: Date.now(),
        slots: [],
      },
      null,
      2,
    ),
    'utf8',
  )

  process.env.WORLD_SAVE_SLOTS_PATH = isolatedSavePath
  process.env.WORLD_SAVE_SLOTS_ARCHIVE_DIR = isolatedArchiveDir

  let report: SaveSlotsRestoreApplyGateReport
  try {
    const { getSaveSlotsArchiveCatalog, getSaveSlotsPersistHealth, runSaveSlotsArchiveRestoreApply } = await import(
      '../application/world/WorldService'
    )

    const catalog = getSaveSlotsArchiveCatalog()
    const selectedArchivePath =
      catalog.archives.find((item) => basename(item.path) === basename(archivePath ?? ''))?.path ??
      catalog.archives[0]?.path ??
      archivePath

    const restore1 = await runSaveSlotsArchiveRestoreApply({ archivePath: selectedArchivePath })
    const restore2 = await runSaveSlotsArchiveRestoreApply({ archivePath: selectedArchivePath })
    const restore3 = await runSaveSlotsArchiveRestoreApply({ archivePath: selectedArchivePath, force: true })
    const health = getSaveSlotsPersistHealth()

    checks.push({
      name: 'source_archive_available',
      passed: true,
      details: {
        sourceArchiveMode: archiveSourceMode,
        sourceArchivePath: archivePath,
      },
    })
    checks.push({
      name: 'restore_apply_first_restored',
      passed: restore1.status === 'restored',
      details: { status: restore1.status, message: restore1.message },
    })
    checks.push({
      name: 'restore_apply_second_skipped',
      passed: restore2.status === 'skipped',
      details: { status: restore2.status, message: restore2.message },
    })
    checks.push({
      name: 'restore_apply_third_force_restored',
      passed: restore3.status === 'restored',
      details: { status: restore3.status, message: restore3.message, forced: true },
    })
    checks.push({
      name: 'restore_apply_health_no_failures',
      passed: health.restoreApplyFailureCount === 0,
      details: {
        restoreApplySuccessCount: health.restoreApplySuccessCount,
        restoreApplyFailureCount: health.restoreApplyFailureCount,
      },
    })
    checks.push({
      name: 'restore_apply_health_success_at_least_two',
      passed: typeof health.restoreApplySuccessCount === 'number' && health.restoreApplySuccessCount >= 2,
      details: { restoreApplySuccessCount: health.restoreApplySuccessCount },
    })

    report = {
      runId,
      generatedAt: new Date().toISOString(),
      checks,
      passed: checks.every((item) => item.passed),
      source: {
        savePath: sourceSavePath,
        archiveDir: sourceArchiveDir,
        archivePath,
        archiveSourceMode,
      },
      isolated: {
        root: isolatedRoot,
        savePath: isolatedSavePath,
        archiveDir: isolatedArchiveDir,
        selectedArchivePath,
      },
      restore: {
        firstStatus: restore1.status,
        secondStatus: restore2.status,
        thirdStatus: restore3.status,
        firstMessage: restore1.message,
        secondMessage: restore2.message,
        thirdMessage: restore3.message,
      },
      health: {
        restoreApplySuccessCount: health.restoreApplySuccessCount,
        restoreApplyFailureCount: health.restoreApplyFailureCount,
        lastRestoreApplyStatus: health.lastRestoreApplyStatus,
        lastRestoreApplyArchivePath: health.lastRestoreApplyArchivePath,
        lastRestoreApplyBackupPath: health.lastRestoreApplyBackupPath,
      },
    }
  } catch (error) {
    report = {
      runId,
      generatedAt: new Date().toISOString(),
      checks,
      passed: false,
      source: {
        savePath: sourceSavePath,
        archiveDir: sourceArchiveDir,
        archivePath,
        archiveSourceMode,
      },
      isolated: {
        root: isolatedRoot,
        savePath: isolatedSavePath,
        archiveDir: isolatedArchiveDir,
        selectedArchivePath: null,
      },
      restore: {
        firstStatus: null,
        secondStatus: null,
        thirdStatus: null,
      },
      health: {
        restoreApplySuccessCount: null,
        restoreApplyFailureCount: null,
        lastRestoreApplyStatus: null,
        lastRestoreApplyArchivePath: null,
        lastRestoreApplyBackupPath: null,
      },
      error: error instanceof Error ? error.message : String(error),
    }
  }

  persistReport(runDir, runId, report)
  report.artifacts = pruneHistoricalArtifacts(runDir, keepRecentArtifacts)
  persistReport(runDir, runId, report)
  console.info(JSON.stringify(report, null, 2))
  process.exit(report.passed ? 0 : 1)
}

void main().catch((error) => {
  const message = error instanceof Error ? error.message : 'save-slot restore apply gate failed'
  console.error(message)
  process.exit(1)
})
