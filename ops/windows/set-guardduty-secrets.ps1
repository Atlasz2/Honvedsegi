[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)][string]$AdminPassword,
    [Parameter(Mandatory = $true)][string]$DevMasterPassword,
    [Parameter(Mandatory = $true)][string]$ReaderPassword,
    [Parameter(Mandatory = $true)][string]$EditorPassword,
    [Parameter(Mandatory = $true)][string]$PasswordPepper,
    [Parameter(Mandatory = $true)][string]$TokenPepper,
    [Parameter(Mandatory = $true)][string]$DataKey,
    [Parameter(Mandatory = $true)][string]$AllowedOrigins,
    [Parameter(Mandatory = $true)][string]$AllowedHosts,
    [string]$BackendEnv = "production"
)

$ErrorActionPreference = "Stop"

if (-not ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    throw "A script futtatásához rendszergazdai jogosultság kell."
}

[Environment]::SetEnvironmentVariable("BACKEND_ADMIN_PASSWORD", $AdminPassword, "Machine")
[Environment]::SetEnvironmentVariable("BACKEND_DEV_MASTER_PASSWORD", $DevMasterPassword, "Machine")
[Environment]::SetEnvironmentVariable("BACKEND_READER_PASSWORD", $ReaderPassword, "Machine")
[Environment]::SetEnvironmentVariable("BACKEND_EDITOR_PASSWORD", $EditorPassword, "Machine")
[Environment]::SetEnvironmentVariable("BACKEND_PASSWORD_PEPPER", $PasswordPepper, "Machine")
[Environment]::SetEnvironmentVariable("BACKEND_TOKEN_PEPPER", $TokenPepper, "Machine")
[Environment]::SetEnvironmentVariable("BACKEND_DATA_KEY", $DataKey, "Machine")
[Environment]::SetEnvironmentVariable("BACKEND_ALLOWED_ORIGINS", $AllowedOrigins, "Machine")
[Environment]::SetEnvironmentVariable("BACKEND_ALLOWED_HOSTS", $AllowedHosts, "Machine")
[Environment]::SetEnvironmentVariable("BACKEND_ENV", $BackendEnv, "Machine")

Write-Host "Környezeti változók beállítva (Machine scope)." -ForegroundColor Green
