@echo off
REM Éles indító — a tiszta, jól olvasható logika a start-prod.ps1-ben van.
REM Ez a wrapper csak azért kell, hogy dupla kattintással is induljon
REM (a PowerShell alapból nem futtat .ps1-et dupla kattra).
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0start-prod.ps1"
pause
