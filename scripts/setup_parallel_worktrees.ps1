param(
  [string]$BaseBranch = "main",
  [string]$RootPrefix = "8989",
  [switch]$Create,
  [switch]$DryRun
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-RepoRoot {
  $root = git rev-parse --show-toplevel 2>$null
  if (-not $root) {
    throw "Not inside a git repository."
  }
  return (Resolve-Path $root).Path
}

function Branch-Exists([string]$name) {
  $result = git show-ref --verify --quiet "refs/heads/$name"
  return ($LASTEXITCODE -eq 0)
}

function Print-Command([string]$cmd) {
  Write-Host "  $cmd"
}

function Ensure-BaseBranch([string]$fallbackBranch) {
  $exists = Branch-Exists $BaseBranch
  if ($exists) {
    return $BaseBranch
  }
  Write-Warning "Base branch '$BaseBranch' not found; fallback to '$fallbackBranch'."
  return $fallbackBranch
}

function Invoke-OrPrint([string]$cmd) {
  if ($DryRun -or -not $Create) {
    Print-Command $cmd
    return
  }
  Invoke-Expression $cmd
}

$repoRoot = Resolve-RepoRoot
Set-Location $repoRoot

$currentBranch = git branch --show-current
if (-not $currentBranch) {
  throw "Failed to resolve current branch."
}

$selectedBase = Ensure-BaseBranch $currentBranch
$parentDir = Split-Path -Parent $repoRoot
$dateTag = Get-Date -Format "yyyyMMddHHmm"

$lanes = @(
  @{ Key = "m18"; Module = "M18"; Focus = "gate/workflow/docs"; PromptFile = "docs/modules_v2/M18.md" },
  @{ Key = "m01"; Module = "M01"; Focus = "save-slot/persistence"; PromptFile = "docs/modules_v2/M01.md" },
  @{ Key = "godot"; Module = "M16/M15"; Focus = "godot-client visuals/runtime"; PromptFile = "docs/GODOT_VISUAL_CONTEXT_ANCHOR_2026_04_11.md" }
)

Write-Host ""
Write-Host "Parallel Worktree Plan"
Write-Host "repoRoot: $repoRoot"
Write-Host "baseBranch: $selectedBase"
Write-Host "mode: " -NoNewline
if ($Create -and -not $DryRun) {
  Write-Host "CREATE"
} else {
  Write-Host "DRY-RUN"
}
Write-Host ""

foreach ($lane in $lanes) {
  $branch = "codex/$($lane.Key)-$dateTag"
  $path = Join-Path $parentDir "$RootPrefix-$($lane.Key)"
  $escapedPath = $path.Replace('\', '/')

  Write-Host "[$($lane.Key)] module=$($lane.Module) focus=$($lane.Focus)"
  if (Test-Path $path) {
    Write-Warning "Target path exists: $path"
  }

  $addCmd = "git worktree add `"$escapedPath`" -b $branch $selectedBase"
  Invoke-OrPrint $addCmd

  Write-Host "  window prompt:"
  Write-Host "  - cwd: $path"
  Write-Host "  - whitelist: lane-only files"
  Write-Host "  - must read: AGENTS.md + docs/AGENTS_EXECUTION_CURRENT_2026_04.md + $($lane.PromptFile)"
  Write-Host ""
}

if (-not $Create -or $DryRun) {
  Write-Host "No filesystem changes applied. Re-run with -Create to materialize worktrees."
}
