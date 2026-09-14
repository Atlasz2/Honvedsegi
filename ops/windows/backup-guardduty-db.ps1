[CmdletBinding()]
param(
    [string]$WorkspaceRoot = "",
    [string]$ArchiveRoot = "C:\ProgramData\GuardGuardDuty\backups",
    [int]$RetentionDays = 30
)

# Ütemezett mentés. Két lépcső:
#  1. a Python mentő (app.backup) a SQLite online backup API-val konzisztens
#     pillanatképet készít a backend\data\backups mappába, és visszaállítás-
#     próbával ellenőrzi (integritás + táblák darabszáma) — fájlmásolás WAL
#     mellett nem lenne biztonságos, ezért nem azt csináljuk;
#  2. a friss, ellenőrzött mentés tömörítve átkerül egy külön archív mappába
#     (ideális esetben másik meghajtóra), és a réginél idősebbek törlődnek.

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($WorkspaceRoot)) {
    $WorkspaceRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

$backendDir = Join-Path $WorkspaceRoot "backend"
$pythonExe = Join-Path $WorkspaceRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) { $pythonExe = "python" }

Push-Location $backendDir
try {
    & $pythonExe -m app.backup
    if ($LASTEXITCODE -ne 0) { throw "A mentés ellenőrzése sikertelen (kilépési kód: $LASTEXITCODE)." }
} finally {
    Pop-Location
}

$latest = Get-ChildItem -Path (Join-Path $backendDir "data\backups") -Filter "guard_*.db" |
    Sort-Object LastWriteTime -Descending | Select-Object -First 1
if (-not $latest) { throw "Nem található elkészült mentés." }

New-Item -ItemType Directory -Path $ArchiveRoot -Force | Out-Null
$zipPath = Join-Path $ArchiveRoot ($latest.BaseName + ".zip")
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }
Compress-Archive -Path $latest.FullName -DestinationPath $zipPath -CompressionLevel Optimal

Get-ChildItem -Path $ArchiveRoot -File -Filter "guard_*.zip" |
    Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$RetentionDays) } |
    Remove-Item -Force

Write-Host "Mentés kész és ellenőrizve: $($latest.Name) → $zipPath" -ForegroundColor Green
