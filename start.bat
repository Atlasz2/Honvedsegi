@echo off

:: 1. Ablak: Backend indítása PowerShell-ben
start "FastAPI Backend" powershell -NoExit -Command "cd backend; $env:BACKEND_DEV_MASTER_PASSWORD='123'; uvicorn app.main:app --reload --host 0.0.0.0 --port 8000"

:: 2. Ablak: Frontend indítása
start "NPM Frontend" cmd /k "npm run dev"

:: 3. Alapértelmezett böngésző megnyitása
:: Várjunk egy kicsit (opcionális), hogy a szerverek elinduljanak
timeout /t 3 /nobreak >nul
start http://localhost:8080

exit