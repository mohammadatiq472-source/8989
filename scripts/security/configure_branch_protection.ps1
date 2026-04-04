[CmdletBinding()]
param(
    [string]$RepoPath = ".",
    [string]$Owner = "",
    [string]$Repository = "",
    [string]$Branch = "main",
    [ValidateRange(1, 6)]
    [int]$RequiredApprovingReviewCount = 1,
    [string]$Token = "",
    [string]$TokenFile = ""
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-Token {
    param(
        [string]$RawToken,
        [string]$Path
    )

    if (-not [string]::IsNullOrWhiteSpace($RawToken)) {
        return $RawToken.Trim()
    }

    if (-not [string]::IsNullOrWhiteSpace($Path)) {
        if (-not (Test-Path -LiteralPath $Path)) {
            throw "Token 文件不存在: $Path"
        }
        return (Get-Content -LiteralPath $Path -Encoding UTF8 -TotalCount 1).Trim()
    }

    if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_TOKEN)) {
        return $env:GITHUB_TOKEN.Trim()
    }

    if (-not [string]::IsNullOrWhiteSpace($env:GITHUB_TOKEN_FILE)) {
        $envTokenFile = $env:GITHUB_TOKEN_FILE.Trim()
        if (-not (Test-Path -LiteralPath $envTokenFile)) {
            throw "环境变量 GITHUB_TOKEN_FILE 指向的文件不存在: $envTokenFile"
        }
        return (Get-Content -LiteralPath $envTokenFile -Encoding UTF8 -TotalCount 1).Trim()
    }

    throw "缺少 GitHub Token。请传入 -Token 或 -TokenFile。"
}

function Resolve-OwnerRepo {
    param(
        [string]$Path,
        [string]$InOwner,
        [string]$InRepo
    )

    if (-not [string]::IsNullOrWhiteSpace($InOwner) -and -not [string]::IsNullOrWhiteSpace($InRepo)) {
        return @{ owner = $InOwner; repo = $InRepo }
    }

    $remote = (& git -C $Path remote get-url origin).Trim()
    if ([string]::IsNullOrWhiteSpace($remote)) {
        throw "无法从 origin 解析仓库地址，请传入 -Owner/-Repository。"
    }

    $normalized = $remote
    if ($normalized.EndsWith(".git")) {
        $normalized = $normalized.Substring(0, $normalized.Length - 4)
    }
    $normalized = $normalized -replace "git@github.com:", "https://github.com/"
    $uri = [Uri]$normalized
    $segments = $uri.AbsolutePath.Trim("/").Split("/")
    if ($segments.Length -lt 2) {
        throw "origin 地址格式异常: $remote"
    }

    return @{
        owner = $segments[0]
        repo = $segments[1]
    }
}

function Invoke-GitHubApi {
    param(
        [string]$Method,
        [string]$Url,
        [hashtable]$Headers,
        [object]$Body = $null
    )

    $invokeParams = @{
        Uri = $Url
        Method = $Method
        Headers = $Headers
        ErrorAction = "Stop"
    }

    if ($null -ne $Body) {
        $json = $Body | ConvertTo-Json -Depth 20
        $invokeParams["Body"] = $json
        $invokeParams["ContentType"] = "application/json; charset=utf-8"
    }

    try {
        $response = Invoke-RestMethod @invokeParams
        return @{
            ok = $true
            status = 200
            body = $response
            error = ""
        }
    } catch {
        $statusCode = 0
        $errorMessage = $_.Exception.Message
        if ($_.ErrorDetails -and -not [string]::IsNullOrWhiteSpace($_.ErrorDetails.Message)) {
            $errorMessage = $_.ErrorDetails.Message
        }
        if ($_.Exception.Response) {
            $statusCode = [int]$_.Exception.Response.StatusCode
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $responseBody = $reader.ReadToEnd()
                if (-not [string]::IsNullOrWhiteSpace($responseBody)) {
                    $errorMessage = $responseBody
                }
            } catch {
                # keep exception message
            }
        }

        return @{
            ok = $false
            status = $statusCode
            body = $null
            error = $errorMessage
        }
    }
}

$resolved = Resolve-OwnerRepo -Path $RepoPath -InOwner $Owner -InRepo $Repository
$token = Read-Token -RawToken $Token -Path $TokenFile

$headers = @{
    Authorization = "Bearer $token"
    Accept = "application/vnd.github+json"
    "X-GitHub-Api-Version" = "2022-11-28"
    "User-Agent" = "dual-machine-pr-flow/1.0"
}

$apiRoot = "https://api.github.com/repos/$($resolved.owner)/$($resolved.repo)"
$protectionUrl = "$apiRoot/branches/$Branch/protection"

$payload = @{
    required_status_checks = @{
        strict = $true
        checks = @(
            @{ context = "phase5-hardening-gate / hardening-gate" },
            @{ context = "dual-machine-pr-gate / dual-machine-review-gate" }
        )
    }
    enforce_admins = $false
    required_pull_request_reviews = @{
        dismiss_stale_reviews = $true
        require_code_owner_reviews = $true
        required_approving_review_count = $RequiredApprovingReviewCount
    }
    restrictions = $null
    required_linear_history = $true
    allow_force_pushes = $false
    allow_deletions = $false
    block_creations = $false
    required_conversation_resolution = $true
    lock_branch = $false
    allow_fork_syncing = $true
}

Write-Host "配置分支保护: $($resolved.owner)/$($resolved.repo)#$Branch" -ForegroundColor Cyan
$result = Invoke-GitHubApi -Method "PUT" -Url $protectionUrl -Headers $headers -Body $payload

if ($result.ok) {
    Write-Host "✅ 分支保护配置成功。" -ForegroundColor Green
    exit 0
}

$errorText = [string]$result.error
if ($result.status -eq 403 -and ($errorText -match "Upgrade to GitHub Pro" -or $errorText -match "branch protection")) {
    Write-Warning "当前仓库计划不支持私有仓库分支保护（需要 GitHub Pro/Team 或改为公开仓库）。"
    Write-Host "已启用的替代门禁：" -ForegroundColor Yellow
    Write-Host "1) .github/workflows/dual-machine-pr-gate.yml" -ForegroundColor White
    Write-Host "2) .github/CODEOWNERS" -ForegroundColor White
    Write-Host "3) .github/pull_request_template.md" -ForegroundColor White
    exit 0
}

Write-Error "分支保护配置失败（HTTP $($result.status)）：$errorText"
