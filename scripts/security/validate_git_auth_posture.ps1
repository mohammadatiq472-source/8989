param(
  [string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path,
  [switch]$Strict
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $RepoPath)) {
  throw "Repo path does not exist: $RepoPath"
}

& git -C $RepoPath rev-parse --is-inside-work-tree | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Not a git repository: $RepoPath"
}

$originFetch = (& git -C $RepoPath remote get-url origin 2>$null)
$localCredentialUser = (& git -C $RepoPath config --local --get credential.username 2>$null)
$localExtraHeader = (& git -C $RepoPath config --local --get http.https://github.com/.extraheader 2>$null)

$riskItems = @()

if ($originFetch -match "https://[^/\s]+:[^@\s]+@github\.com/") {
  $riskItems += "origin remote appears to embed credentials"
}

if ($originFetch -match "^https://github\.com/") {
  $riskItems += "origin remote uses https; recommend SSH for dual-machine setup"
}

if ($localCredentialUser) {
  $riskItems += "local credential.username is set; prefer managed credential helper only"
}

if ($localExtraHeader) {
  $riskItems += "local github extraheader exists; verify no stale token header"
}

$sshDir = Join-Path $HOME ".ssh"
$sshConfig = Join-Path $sshDir "config"
$hasSshConfig = Test-Path $sshConfig

$report = [ordered]@{
  repoPath = $RepoPath
  originFetch = $originFetch
  hasSshConfig = $hasSshConfig
  riskCount = $riskItems.Count
  riskItems = $riskItems
  recommendation = if ($riskItems.Count -eq 0) {
    "Auth posture looks clean."
  } else {
    "Run setup_github_ssh.ps1 and harden_repo_git_auth.ps1."
  }
}

$report | ConvertTo-Json -Depth 5

if ($Strict -and $riskItems.Count -gt 0) {
  exit 2
}
