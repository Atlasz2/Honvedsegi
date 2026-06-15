# ============================================================================
#  Éles indító — EGY uvicorn folyamat szolgálja ki a buildelt frontendet ÉS az
#  API-t ugyanazon a porton. A felhasználók böngészőből érik el a hálózatról:
#      http://<ennek-a-gépnek-az-IP-címe>:<port>
#
#  Indítás: dupla katt a start-prod.bat fájlra (az hívja ezt a szkriptet).
#  Leállítás: Ctrl+C az ablakban.
# ============================================================================
$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# ── Konfiguráció (telepítéskor állítsd be) ──────────────────────────────────
$env:BACKEND_ENV = 'production'
$BindHost = '0.0.0.0'   # 0.0.0.0 = minden hálózati interfészen elérhető
$Port     = '8000'

# A kliensek által küldött Host fejléc(ek). Belső, zárt hálózaton a '*' a
# legkevésbé hibázós (nem zár ki IP-t/gépnevet). Szigorításhoz írd ide a gép
# fix IP-jét vagy nevét, vesszővel elválasztva, pl. '10.0.0.5,honved-szerver'.
$env:BACKEND_ALLOWED_HOSTS = '*'
# Azonos origin esetén (a frontendet ez a folyamat szolgálja) CORS nincs
# használatban; a változó csak nem lehet üres production módban.
$env:BACKEND_ALLOWED_ORIGINS = 'http://localhost'

# Több párhuzamos riport-generálásnál (PDF/Excel/Word) érdemes lehet 2-4-re
# emelni. Minimális erőforrásigényhez hagyd 1-en.
$Workers = '1'

# ── Titkok betöltése (backend\prod.env) ─────────────────────────────────────
# A kezdeti felhasználók jelszavai CSAK az első indításkor kellenek. Másold a
# backend\prod.env.example fájlt 'prod.env' néven, és töltsd ki. A prod.env NEM
# kerül gitbe (lásd .gitignore).
$envFile = Join-Path $root 'backend\prod.env'
if (Test-Path $envFile) {
    foreach ($line in Get-Content $envFile) {
        if ($line -match '^\s*#' -or $line -notmatch '=') { continue }
        $name, $value = $line -split '=', 2
        Set-Item -Path "Env:$($name.Trim())" -Value $value.Trim()
    }
}

# ── Build-ellenőrzés ────────────────────────────────────────────────────────
if (-not (Test-Path (Join-Path $root 'dist\index.html'))) {
    Write-Warning 'Nincs frontend build (dist\index.html hiányzik).'
    Write-Warning 'Egy internetkapcsolattal rendelkező gépen futtasd: npm install ; npm run build'
}

# ── Indítás ─────────────────────────────────────────────────────────────────
$python = Join-Path $root '.venv\Scripts\python.exe'
Set-Location (Join-Path $root 'backend')
& $python -m uvicorn app.main:app --host $BindHost --port $Port --workers $Workers
