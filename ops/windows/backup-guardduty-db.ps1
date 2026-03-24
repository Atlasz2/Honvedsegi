[CmdletBinding()]
param(
    [string]$WorkspaceRoot = "",
    [string]$BackupRoot = "C:\ProgramData\GuardGuardDuty\backups",
    [int]$RetentionDays = 30
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
    $WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$dataDir = Join-Path $WorkspaceRoot "backend\data"
$db = Join-Path $dataDir "guard_guard_duty.db"
$wal = "$db-wal"
$shm = "$db-shm"

if (-not (Test-Path $db)) {
    throw "Nem található adatbázis: $db"
}

New-Item -ItemType Directory -Path $BackupRoot -Force | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$tempDir = Join-Path $BackupRoot "snapshot-$stamp"
New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

Copy-Item $db -Destination $tempDir -Force
if (Test-Path $wal) { Copy-Item $wal -Destination $tempDir -Force }
if (Test-Path $shm) { Copy-Item $shm -Destination $tempDir -Force }

$zipPath = Join-Path $BackupRoot "guard_guard_duty-$stamp.zip"
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path (Join-Path $tempDir "*") -DestinationPath $zipPath -CompressionLevel Optimal
Remove-Item $tempDir -Recurse -Force

Get-ChildItem -Path $BackupRoot -File -Filter "guard_guard_duty-*.zip" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
    Remove-Item -Force

Write-Host "Mentés elkészült: $zipPath" -ForegroundColor Green
