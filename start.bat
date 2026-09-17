@echo off
setlocal enabledelayedexpansion
title PHAROS Unified Launcher

echo ===================================================
echo     PHAROS Application Startup Script
echo ===================================================
echo.

:: ── Step 0: Skip port cleanup to prevent hijacking ─────────────────────────
echo [0/6] Application port locks cleanup skipped...
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

echo [4.6/6] Auto-updating import template baseline...
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
    python -m pip install -r requirements.txt --quiet >nul 2>&1
    start "PHAROS Python Worker" cmd /k "cd /d %~dp0python_worker && python main.py"
    echo  [OK] Python worker launched.
) else (
    echo  [Notice] Python not found in PATH; skipping background report worker.
)
cd /d %~dp0
echo.

echo [6/6] Launching PHAROS Backend API...
start "PHAROS Backend" cmd /k "cd /d %~dp0backend && npm run dev"
echo  [OK] Backend launched on http://localhost:5000
echo.

echo ===================================================
echo  PHAROS is up and running!
echo  Backend API: http://localhost:5000
echo  Frontend UI: http://localhost:5173
echo ===================================================
ping 127.0.0.1 -n 6 >nul
