[CmdletBinding()]
param(
    [string]$Host = "0.0.0.0",
    [int]$Port = 8000,
    [string]$WorkspaceRoot = ""
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
    $WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$backendDir = Join-Path $WorkspaceRoot "backend"
$pythonExe = Join-Path $WorkspaceRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    $pythonExe = "python"
}

$required = @(
    "BACKEND_ADMIN_PASSWORD",
    "BACKEND_DEV_MASTER_PASSWORD",
    "BACKEND_PASSWORD_PEPPER",
    "BACKEND_TOKEN_PEPPER",
    "BACKEND_ALLOWED_ORIGINS",
    "BACKEND_ALLOWED_HOSTS"
)

foreach ($name in $required) {
    $val = [Environment]::GetEnvironmentVariable($name, "Process")
    if ([string]::IsNullOrWhiteSpace($val)) {
        $val = [Environment]::GetEnvironmentVariable($name, "Machine")
    }
    if ([string]::IsNullOrWhiteSpace($val)) {
        throw "Hiányzó környezeti változó: $name"
    }
    [Environment]::SetEnvironmentVariable($name, $val, "Process")
}

if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable("BACKEND_ENV", "Process"))) {
    [Environment]::SetEnvironmentVariable("BACKEND_ENV", "production", "Process")
}

Set-Location $backendDir
& $pythonExe -m uvicorn app.main:app --host $Host --port $Port
