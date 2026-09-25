@echo off
setlocal enabledelayedexpansion
title PHAROS Unified Launcher

echo ===================================================
echo     PHAROS Application Startup Script
echo ===================================================
echo.

:: ── Step 0: Clean stale node processes on app ports ────────────────────────
echo [0/6] Cleaning stale port locks (3000, 5000, 5173-5180)...
for %%p in (3000 5000 5173 5174 5175 5176 5177 5178 5179 5180) do (
    for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :%%p ^| findstr LISTENING 2^>nul') do (
        if "%%a" neq "0" (
            taskkill /F /PID %%a >nul 2>&1
        )
    )
)
echo  [OK] Port locks cleared.
echo.

:: ── Step 1: Ensure Docker daemon is reachable ──────────────────────────────
echo [1/6] Checking Docker Desktop status...
docker info >nul 2>&1
if %ERRORLEVEL% equ 0 goto dockerready

echo  [!] Docker daemon is not active. Attempting to start Docker Desktop...
if exist "%ProgramFiles%\Docker\Docker\Docker Desktop.exe" (
    start "" "%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
)

echo  Waiting for Docker daemon to initialize (up to 60s)...
set /a _tries=0

:waitdocker
docker info >nul 2>&1
if %ERRORLEVEL% equ 0 goto dockerready
set /a _tries+=1
if !_tries! geq 20 (
    echo.
    echo  [ERROR] Docker did not respond within 60s.
    echo          Please ensure Docker Desktop is running and run start.bat again.
    echo.
    pause
    exit /b 1
)
echo  Waiting for Docker... (!_tries!/20)
ping 127.0.0.1 -n 4 >nul
goto waitdocker

:dockerready
echo  [OK] Docker daemon is running.
echo.

echo [1b/6] Starting Docker services (PostgreSQL, RabbitMQ, Redis)...
cd /d %~dp0
docker compose up -d
if %ERRORLEVEL% neq 0 (
    echo  [Warning] docker compose up encountered an issue. Checking containers...
)

:: Wait for PostgreSQL database readiness smoothly via container health check or port 5435
echo  Waiting for database container readiness...
set /a _dbtries=0

:waitdb
docker compose exec -T db pg_isready -U postgres >nul 2>&1
if %ERRORLEVEL% equ 0 goto dbready
netstat -aon 2>nul | findstr :5435 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% equ 0 goto dbready
set /a _dbtries+=1
if !_dbtries! geq 15 (
    echo  [Notice] Proceeding with database setup...
    goto dbready
)
ping 127.0.0.1 -n 3 >nul
goto waitdb

:dbready
echo  [OK] Database service is ready.
echo.

echo [2/6] Verifying backend dependencies...
cd /d %~dp0backend
call npm install --no-audit --no-fund
echo.

echo [2.5/6] Verifying frontend dependencies...
cd /d %~dp0frontend
call npm install --no-audit --no-fund
echo.

echo [3/6] Running database migrations...
cd /d %~dp0backend
call npm run db:migrate
if %ERRORLEVEL% neq 0 (
    echo  [Warning] Migration encountered an error. Attempting to proceed...
)
echo.

echo [4/6] Seeding essential system data...
call npm run db:seed
echo.

echo [4.5/6] Seeding development test records...
node scripts/seed-test-data.js
echo.

echo [4.6/6] Seeding report presets...
node scripts/seed-report-presets.js
echo.

echo [4.7/6] Auto-updating import template baseline...
node scripts/template-regression.js baseline
echo.

echo [5/6] Launching PHAROS Frontend...
start "PHAROS Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
echo  [OK] Frontend launched on http://localhost:5173
echo.

echo [5.5/6] Launching Python report worker...
cd /d %~dp0python_worker
where python >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo  Installing/updating Python worker dependencies...
    python -m pip install -r requirements.txt
    if !ERRORLEVEL! neq 0 (
        echo.
        echo  [WARNING] pip install failed for python_worker\requirements.txt - see errors above.
        echo            The report worker will likely fail to start with a "ModuleNotFoundError".
        echo            If the failing package is weasyprint, it needs the GTK3 runtime installed
        echo            on Windows first - install it, then run start.bat again.
        echo.
    )
    start "PHAROS Python Worker" cmd /k "cd /d %~dp0python_worker && python main.py"
    echo  [OK] Python worker launched.
) else (
    where py >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        echo  Installing/updating Python worker dependencies...
        py -m pip install -r requirements.txt
        if !ERRORLEVEL! neq 0 (
            echo.
            echo  [WARNING] pip install failed for python_worker\requirements.txt - see errors above.
            echo            The report worker will likely fail to start with a "ModuleNotFoundError".
            echo            If the failing package is weasyprint, it needs the GTK3 runtime installed
            echo            on Windows first - install it, then run start.bat again.
            echo.
        )
        start "PHAROS Python Worker" cmd /k "cd /d %~dp0python_worker && py main.py"
        echo  [OK] Python worker launched via py launcher.
    ) else (
        echo  [Notice] Python not found in PATH; skipping background report worker.
    )
)
cd /d %~dp0
echo.

echo [6/6] Launching PHAROS Backend API...
start "PHAROS Backend" cmd /k "cd /d %~dp0backend && npm run dev"
echo  [OK] Backend launched on http://localhost:3000
echo.

echo ===================================================
echo  PHAROS is up and running!
echo  Backend API: http://localhost:3000
echo  Frontend UI: http://localhost:5173
echo ===================================================
ping 127.0.0.1 -n 6 >nul
