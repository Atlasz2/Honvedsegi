[CmdletBinding()]
param(
    [string]$BaseUrl = "http://127.0.0.1:8000",
    [int]$TimeoutSec = 8
)

$ErrorActionPreference = "Stop"

$uri = "$($BaseUrl.TrimEnd('/'))/api/health"

try {
    $resp = Invoke-RestMethod -Uri $uri -Method Get -TimeoutSec $TimeoutSec
} catch {
    Write-Error "Health check sikertelen: $uri`n$($_.Exception.Message)"
    exit 1
}

if ($resp.status -ne "ok") {
    Write-Error "Health check hibás választ adott: $($resp | ConvertTo-Json -Compress)"
    exit 2
}

Write-Host "Health check OK: $uri" -ForegroundColor Green
Write-Host "Environment: $($resp.environment)"
Write-Host "Server time: $($resp.time)"
