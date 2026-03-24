[CmdletBinding()]
param(
    [string]$ServiceName = "GuardGuardDutyApi",
    [string]$DisplayName = "Guard Guard Duty API",
    [string]$Description = "Guard Guard Duty FastAPI backend service",
    [string]$BackendHost = "0.0.0.0",
    [int]$BackendPort = 8000,
    [string]$WorkspaceRoot = ""
)

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    throw "A script futtatásához rendszergazdai jogosultság kell."
}

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
    $WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$launcher = Join-Path $PSScriptRoot "start-guardduty-backend.ps1"
$pwsh = (Get-Command pwsh).Source
$binPath = ""$pwsh" -NoProfile -ExecutionPolicy Bypass -File "$launcher" -Host "$BackendHost" -Port $BackendPort -WorkspaceRoot "$WorkspaceRoot""

$existing = Get-Service -Name $ServiceName -ErrorAction SilentlyContinue
if ($existing) {
    if ($existing.Status -eq "Running") {
        Stop-Service -Name $ServiceName -Force
    }
    sc.exe delete $ServiceName | Out-Null
    Start-Sleep -Seconds 2
}

New-Service -Name $ServiceName -BinaryPathName $binPath -DisplayName $DisplayName -Description $Description -StartupType Automatic
Start-Service -Name $ServiceName

Write-Host "Service telepítve és elindítva: $ServiceName" -ForegroundColor Green
