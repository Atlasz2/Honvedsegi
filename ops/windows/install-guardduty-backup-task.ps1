[CmdletBinding()]
param(
    [string]$TaskName = "GuardGuardDuty-DB-Backup",
    [string]$DailyAt = "02:00"
)

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    throw "A script futtatásához rendszergazdai jogosultság kell."
}

$backupScript = Join-Path $PSScriptRoot "backup-guardduty-db.ps1"
$pwsh = (Get-Command pwsh).Source

$action = New-ScheduledTaskAction -Execute $pwsh -Argument "-NoProfile -ExecutionPolicy Bypass -File "$backupScript""
$trigger = New-ScheduledTaskTrigger -Daily -At $DailyAt
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -ExecutionTimeLimit (New-TimeSpan -Hours 2)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host "Ütemezett mentés létrehozva: $TaskName ($DailyAt)" -ForegroundColor Green
