param(
  [string]$UsbDrive = "E:",
  [ValidateSet("minimal", "recommended")]
  [string]$Profile = "recommended",
  [switch]$IncludeSourceAssets,
  [switch]$IncludeSlgclientSource,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  return (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
}

function Ensure-Directory([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) {
    New-Item -ItemType Directory -Path $path | Out-Null
  }
}

function Copy-DirectoryRobust([string]$source, [string]$destination, [switch]$WhatIfMode) {
  if (-not (Test-Path -LiteralPath $source)) {
    Write-Warning "Skip missing directory: $source"
    return
  }

  Ensure-Directory $destination
  $args = @(
    $source,
    $destination,
    "/E",
    "/R:1",
    "/W:1",
    "/NFL",
    "/NDL",
    "/NJH",
    "/NJS",
    "/NP"
  )
  if ($WhatIfMode) {
    $args += "/L"
  }

  & robocopy @args | Out-Null
  if ($LASTEXITCODE -ge 8) {
    throw "robocopy failed for directory: $source -> $destination (exit=$LASTEXITCODE)"
  }
}

function Copy-FileSafe([string]$source, [string]$destination, [switch]$WhatIfMode) {
  if (-not (Test-Path -LiteralPath $source)) {
    Write-Warning "Skip missing file: $source"
    return
  }

  $parent = Split-Path -Parent $destination
  Ensure-Directory $parent

  if ($WhatIfMode) {
    Write-Host "[DRY-RUN] file $source -> $destination"
    return
  }

  Copy-Item -LiteralPath $source -Destination $destination -Force
}

function Measure-EntryBytes([string]$path) {
  if (-not (Test-Path -LiteralPath $path)) {
    return 0L
  }

  $item = Get-Item -LiteralPath $path -Force
  if ($item.PSIsContainer) {
    return [int64](Get-ChildItem -LiteralPath $path -Recurse -File -Force | Measure-Object -Property Length -Sum).Sum
  }

  return [int64]$item.Length
}

$repoRoot = Resolve-RepoRoot
$usbRoot = (Resolve-Path $UsbDrive).Path
$packageRoot = Join-Path $usbRoot "8989"

$rootFiles = @(
  "AGENTS.md",
  ".gitignore",
  "README.md",
  "CODEX.md",
  "CLAUDE.md",
  "Start-Codex-Harness-Isolated.cmd",
  "package.json",
  "package-lock.json",
  "tsconfig.json",
  "tsconfig.server.json",
  "eslint.config.js",
  ".env",
  ".env.local",
  ".env.example",
  "WORKTREE_PARALLEL_QUICKSTART_2026_04_11.md",
  "5248c1d9640247e739d2d7f2addee905_raw.mp4",
  "78c0e5feed94a5ff00525e8daa53e8ce.mp4",
  "a60de4784fcc191f7ea8a92e711e0f66.mp4",
  "fd6f2df7950e1578d286ca4d2ca50b71.mp4"
)

$rootDirs = @(
  ".git",
  ".github",
  ".vscode",
  "docs",
  "scripts",
  "server",
  "shared",
  "godot-client"
)

$obsidianFiles = @(
  ".obsidian\\workspace.json",
  ".obsidian\\graph.json",
  ".obsidian\\core-plugins.json",
  ".obsidian\\community-plugins.json",
  ".obsidian\\plugins\\claudian\\data.json"
)

$recommendedTmpFiles = @(
  "tmp\\world_snapshot.json",
  "tmp\\world_save_slots.json",
  "tmp\\narrative_events.json",
  "tmp\\civil_memory_ledger.json",
  "tmp\\court_sessions.json",
  "tmp\\session_state.json",
  "tmp\\v2_game_state.json",
  "tmp\\general_negotiation_inbox.json"
)

$recommendedTmpDirs = @(
  "tmp\\general_profiles",
  "tmp\\video_frames_ltzb_focus_20260416",
  "tmp\\video_frames_more_targets_20260416",
  "tmp\\video_frames_alliance_20260416",
  "tmp\\video_frames_field_buildings_20260416",
  "tmp\\screenshots\\SLG-UI-P1-D"
)

$recommendedEvidenceFiles = @(
  "tmp\\screenshots\\generalpic_contact_01.png",
  "tmp\\screenshots\\hud_stage1_after_restart.png",
  "tmp\\screenshots\\hud_stage2_flags_mapping.png",
  "tmp\\screenshots\\ui_asset_contact_01.png"
)

$conditionalDirs = @()
if ($IncludeSlgclientSource) {
  $conditionalDirs += "tmp\\third_party\\slgclient"
}
if ($IncludeSourceAssets) {
  $conditionalDirs += @(
    "Isometric Nature Pack 2.0",
    "Isometric Medieval Pack (1)",
    "234",
    "00-OpenClaw-Hub"
  )
}

$selectedPaths = @()
$selectedPaths += $rootFiles
$selectedPaths += $rootDirs
$selectedPaths += $obsidianFiles
if ($Profile -eq "recommended") {
  $selectedPaths += $recommendedTmpFiles
  $selectedPaths += $recommendedTmpDirs
  $selectedPaths += $recommendedEvidenceFiles
}
$selectedPaths += $conditionalDirs

$estimatedBytes = 0L
foreach ($relativePath in $selectedPaths) {
  $estimatedBytes += Measure-EntryBytes (Join-Path $repoRoot $relativePath)
}

Write-Host ""
Write-Host "USB migration package"
Write-Host "repoRoot: $repoRoot"
Write-Host "usbRoot: $usbRoot"
Write-Host "packageRoot: $packageRoot"
Write-Host "profile: $Profile"
Write-Host "includeSourceAssets: $IncludeSourceAssets"
Write-Host "includeSlgclientSource: $IncludeSlgclientSource"
Write-Host ("estimatedBytes: {0}" -f $estimatedBytes)
Write-Host ("estimatedGB: {0:N2}" -f ($estimatedBytes / 1GB))
if ($DryRun) {
  Write-Host "mode: DRY-RUN"
} else {
  Write-Host "mode: COPY"
}
Write-Host ""

Ensure-Directory $packageRoot

foreach ($relativePath in $rootDirs) {
  $source = Join-Path $repoRoot $relativePath
  $destination = Join-Path $packageRoot $relativePath
  Copy-DirectoryRobust -source $source -destination $destination -WhatIfMode:$DryRun
}

foreach ($relativePath in $rootFiles) {
  $source = Join-Path $repoRoot $relativePath
  $destination = Join-Path $packageRoot $relativePath
  Copy-FileSafe -source $source -destination $destination -WhatIfMode:$DryRun
}

foreach ($relativePath in $obsidianFiles) {
  $source = Join-Path $repoRoot $relativePath
  $destination = Join-Path $packageRoot $relativePath
  Copy-FileSafe -source $source -destination $destination -WhatIfMode:$DryRun
}

if ($Profile -eq "recommended") {
  foreach ($relativePath in $recommendedTmpDirs) {
    $source = Join-Path $repoRoot $relativePath
    $destination = Join-Path $packageRoot $relativePath
    Copy-DirectoryRobust -source $source -destination $destination -WhatIfMode:$DryRun
  }

  foreach ($relativePath in ($recommendedTmpFiles + $recommendedEvidenceFiles)) {
    $source = Join-Path $repoRoot $relativePath
    $destination = Join-Path $packageRoot $relativePath
    Copy-FileSafe -source $source -destination $destination -WhatIfMode:$DryRun
  }
}

foreach ($relativePath in $conditionalDirs) {
  $source = Join-Path $repoRoot $relativePath
  $destination = Join-Path $packageRoot $relativePath
  Copy-DirectoryRobust -source $source -destination $destination -WhatIfMode:$DryRun
}

Write-Host ""
Write-Host "Done."
Write-Host "Next step on target machine:"
Write-Host "1. Copy E:\\8989 to the new machine desktop (prefer keeping folder name '8989')."
Write-Host "2. If the new machine user path differs, code still works, but absolute evidence links may need rewriting."
