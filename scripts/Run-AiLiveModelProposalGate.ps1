param(
  [string]$BaseUrl = "https://xiamiapi.xyz",
  [string]$Model = "claude-sonnet-4-6",
  [switch]$ValidateOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Convert-SecretToPlainText {
  param([System.Security.SecureString]$Secret)

  $ptr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($Secret)
  try {
    return [Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr)
  }
  finally {
    if ($ptr -ne [IntPtr]::Zero) {
      [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr)
    }
  }
}

function Restore-Env {
  param([hashtable]$Snapshot)

  foreach ($name in $Snapshot.Keys) {
    $value = $Snapshot[$name]
    if ($null -eq $value) {
      Remove-Item "Env:$name" -ErrorAction SilentlyContinue
    }
    else {
      Set-Item "Env:$name" $value
    }
  }
}

$managedEnvNames = @(
  "AI_PLAYER_RUNTIME_MODEL_API_KEY",
  "AI_PLAYER_RUNTIME_MODEL_BASE_URL",
  "AI_PLAYER_RUNTIME_MODEL"
)

if ($ValidateOnly) {
  Write-Host "[ai-live-model-gate] validate-only: helper is ready; no secret requested."
  exit 0
}

$snapshot = @{}
foreach ($name in $managedEnvNames) {
  $snapshot[$name] = [Environment]::GetEnvironmentVariable($name, "Process")
}

$plainKey = $null
try {
  $secureKey = Read-Host "Paste relay API key for this one gate run" -AsSecureString
  $plainKey = Convert-SecretToPlainText $secureKey
  if ([string]::IsNullOrWhiteSpace($plainKey)) {
    throw "empty relay API key"
  }

  $env:AI_PLAYER_RUNTIME_MODEL_API_KEY = $plainKey
  $env:AI_PLAYER_RUNTIME_MODEL_BASE_URL = $BaseUrl
  $env:AI_PLAYER_RUNTIME_MODEL = $Model

  npm run gate:ai:live-model-proposal
  if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
  }
}
finally {
  $plainKey = $null
  Restore-Env $snapshot
}
