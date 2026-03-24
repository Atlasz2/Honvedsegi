[CmdletBinding()]
param(
    [int]$BackendPort = 8000,
    [string]$AllowedSubnet = "192.168.0.0/16"
)

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    throw "A script futtatásához rendszergazdai jogosultság kell."
}

$ruleName = "GuardGuardDuty API Inbound $BackendPort"
Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue | Remove-NetFirewallRule

New-NetFirewallRule `
    -DisplayName $ruleName `
    -Direction Inbound `
    -Action Allow `
    -Protocol TCP `
    -LocalPort $BackendPort `
    -RemoteAddress $AllowedSubnet `
    -Profile Domain,Private

Write-Host "Tűzfal szabály létrehozva: $ruleName" -ForegroundColor Green
