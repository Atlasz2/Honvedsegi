[CmdletBinding()]
param(
    [string]$TaskName = "GuardGuardDuty-Backend",
    [string]$BackendHost = "0.0.0.0",
    [int]$BackendPort = 8000,
    [string]$WorkspaceRoot = ""
)

# A backend automatikus indítása és újraindítása — Feladatütemezővel, nem
# Windows-szolgálatként. Miért: a szolgálat-vezérlő egy sima konzolos
# indítót (pwsh + uvicorn) nem tud szolgálatként kezelni külön burkoló nélkül,
# a feladatütemező viszont gépindításkor elindítja, hiba esetén újraindítja
# (RestartCount/RestartInterval), és nem kell hozzá külső program az offline
# gépre. A régi install-guardduty-service.ps1 megmarad, ha lesz burkoló.

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    throw "A script futtatásához rendszergazdai jogosultság kell."
}
if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
    $WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$launcher = Join-Path $PSScriptRoot "start-guardduty-backend.ps1"
$pwsh = (Get-Command pwsh).Source
$arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$launcher`" -Host `"$BackendHost`" -Port $BackendPort -WorkspaceRoot `"$WorkspaceRoot`""

$action = New-ScheduledTaskAction -Execute $pwsh -Argument $arguments -WorkingDirectory $WorkspaceRoot
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew `
    -DontStopIfGoingOnBatteries -AllowStartIfOnBatteries

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName
Write-Host "Automatikus indítás beállítva és elindítva: $TaskName (gépindításkor indul, hiba után 1 percen belül újraindul)." -ForegroundColor Green
Write-Host "Ellenőrzés: Get-ScheduledTaskInfo -TaskName $TaskName ; leállítás: Stop-ScheduledTask -TaskName $TaskName"
