# ============================================================================
#  Létrehoz egy parancsikont (.url), ami a rendszer böngészős címére mutat.
#  A kész HonvedRendszer.url fájlt tedd a hálózati megosztásra — a felhasználók
#  az ország bármely pontjáról egyszerűen erre dupla kattintva nyitják meg.
#
#  Használat (a központi gépen):
#      .\create-shortcut.ps1                  # IP automatikus felismerése
#      .\create-shortcut.ps1 -ServerIp 10.0.0.5 -Port 8000
# ============================================================================
param(
    [string]$ServerIp = '',
    [int]$Port = 8000
)
$ErrorActionPreference = 'Stop'

if (-not $ServerIp) {
    # Az első nem-loopback, nem APIPA (169.254.x) IPv4 cím kiválasztása.
    $ServerIp = (Get-NetIPAddress -AddressFamily IPv4 |
        Where-Object { $_.IPAddress -ne '127.0.0.1' -and $_.IPAddress -notlike '169.254.*' } |
        Sort-Object -Property InterfaceMetric |
        Select-Object -First 1 -ExpandProperty IPAddress)
}
if (-not $ServerIp) {
    throw 'Nem sikerült IP-címet meghatározni. Add meg kézzel: -ServerIp <cím>'
}

$url = "http://${ServerIp}:${Port}"
$outFile = Join-Path $PSScriptRoot 'HonvedRendszer.url'

@"
[InternetShortcut]
URL=$url
"@ | Set-Content -Path $outFile -Encoding ASCII

Write-Host "Parancsikon létrehozva: $outFile"
Write-Host "Cím: $url"
Write-Host 'Másold a HonvedRendszer.url fájlt a hálózati megosztásra.'
