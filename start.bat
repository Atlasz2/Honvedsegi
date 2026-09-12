@echo off

:: 1. Ablak: Backend ind?t?sa PowerShell-ben
start "FastAPI Backend" powershell -NoExit -Command "$ErrorActionPreference='Stop'; Set-Location \"%~dp0backend\"; $env:BACKEND_ADMIN_PASSWORD='Admin123'; $env:BACKEND_DEV_MASTER_PASSWORD='Malnas123'; & \"%~dp0.venv\Scripts\python.exe\" -m uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

:: 2. Ablak: Frontend ind?t?sa
start "NPM Frontend" cmd /k "npm run dev"

:: 3. Alap?rtelmezett b?ng?sz? megnyit?sa
:: V?rjunk egy kicsit (opcion?lis), hogy a szerverek elinduljanak
timeout /t 3 /nobreak >nul
start http://localhost:8080

exit
