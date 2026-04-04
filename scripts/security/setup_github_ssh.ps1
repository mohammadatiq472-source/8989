param(
  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[A-Za-z0-9_-]+$")]
  [string]$MachineId,

  [Parameter(Mandatory = $true)]
  [ValidatePattern("^[A-Za-z0-9-]+$")]
  [string]$GitHubUser,

  [Parameter(Mandatory = $true)]
  [string]$Email,

  [switch]$Force
)

$ErrorActionPreference = "Stop"

$sshDir = Join-Path $HOME ".ssh"
if (!(Test-Path $sshDir)) {
  New-Item -ItemType Directory -Path $sshDir | Out-Null
}

$machine = $MachineId.ToLowerInvariant()
$hostAlias = "github-$machine"
$keyName = "id_ed25519_${GitHubUser}_$machine"
$privateKeyPath = Join-Path $sshDir $keyName
$publicKeyPath = "$privateKeyPath.pub"
$configPath = Join-Path $sshDir "config"

if ((Test-Path $privateKeyPath) -and !$Force) {
  throw "SSH key already exists at $privateKeyPath. Re-run with -Force to replace."
}

if ((Test-Path $privateKeyPath) -and $Force) {
  Remove-Item -LiteralPath $privateKeyPath -Force
}
if ((Test-Path $publicKeyPath) -and $Force) {
  Remove-Item -LiteralPath $publicKeyPath -Force
}

& ssh-keygen -t ed25519 -C "$Email [$MachineId] 8989" -f $privateKeyPath -N ""
if ($LASTEXITCODE -ne 0) {
  throw "ssh-keygen failed with code $LASTEXITCODE"
}

$configBlock = @"
Host $hostAlias
  HostName github.com
  User git
  IdentityFile "$privateKeyPath"
  IdentitiesOnly yes
  StrictHostKeyChecking accept-new
  KexAlgorithms curve25519-sha256
"@

if (Test-Path $configPath) {
  $configRaw = Get-Content -Raw -LiteralPath $configPath
  if ($configRaw -notmatch "(?m)^Host\s+$hostAlias\s*$") {
    Add-Content -LiteralPath $configPath -Value "`r`n$configBlock`r`n"
  }
} else {
  Set-Content -LiteralPath $configPath -Value "$configBlock`r`n"
}

$pubKey = Get-Content -Raw -LiteralPath $publicKeyPath

Write-Host "Created SSH key:"
Write-Host "  Private: $privateKeyPath"
Write-Host "  Public : $publicKeyPath"
Write-Host ""
Write-Host "Next steps:"
Write-Host "1) Add public key to GitHub account '$GitHubUser' (Settings > SSH and GPG keys)."
Write-Host "2) Title suggestion: 8989-$MachineId"
Write-Host "3) Verify with: ssh -T $hostAlias"
Write-Host ""
Write-Host "Public key (copy to GitHub):"
Write-Host $pubKey
