param(
  [string]$RepoPath = (Resolve-Path (Join-Path $PSScriptRoot "..\\..")).Path,
  [ValidatePattern("^[A-Za-z0-9.-]+$")]
  [string]$RemoteHostAlias = "github.com",
  [string]$Owner = "mohammadatiq472-source",
  [string]$Repository = "8989",
  [switch]$SwitchRemoteToSsh
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $RepoPath)) {
  throw "Repo path does not exist: $RepoPath"
}

& git -C $RepoPath rev-parse --is-inside-work-tree | Out-Null
if ($LASTEXITCODE -ne 0) {
  throw "Not a git repository: $RepoPath"
}

if ($SwitchRemoteToSsh) {
  $sshUrl = "git@${RemoteHostAlias}:$Owner/$Repository.git"
  & git -C $RepoPath remote set-url origin $sshUrl
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to set origin to $sshUrl"
  }
  Write-Host "origin remote switched to SSH: $sshUrl"
}

& git -C $RepoPath config --local --unset-all credential.username 2>$null
& git -C $RepoPath config --local --unset-all http.https://github.com/.extraheader 2>$null

$remotes = & git -C $RepoPath remote -v
$patInRemote = $false
foreach ($line in $remotes) {
  if ($line -match "https://[^/\s]+:[^@\s]+@github\.com/") {
    $patInRemote = $true
  }
}

if ($patInRemote) {
  throw "Detected token-like credential embedded in remote URL. Clean remotes before continuing."
}

Write-Host "Repository auth hardening completed for $RepoPath"
