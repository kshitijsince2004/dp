@echo off
setlocal enabledelayedexpansion
title PHAROS Shutdown Script

echo ===================================================
echo     Stopping PHAROS Application Processes
echo ===================================================
echo.

echo [1/3] Closing command prompt windows...
taskkill /F /FI "WINDOWTITLE eq PHAROS Frontend*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq PHAROS Backend*" >nul 2>&1
taskkill /F /FI "WINDOWTITLE eq PHAROS Python Worker*" >nul 2>&1
echo  [OK] Windows closed.
echo.

echo [2/3] Terminating any dangling processes on known ports...
for %%p in (3000 5000 5173 5174 5175 5176 5177 5178 5179 5180) do (
    for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :%%p ^| findstr LISTENING 2^>nul') do (
        if "%%a" neq "0" (
            echo  Killing process on port %%p ^(PID: %%a^)...
            taskkill /F /PID %%a >nul 2>&1
        )
    )
)
echo  [OK] Ports cleared.
echo.

echo [3/3] Stopping Docker containers (PostgreSQL, RabbitMQ, Redis)...
cd /d %~dp0
docker compose down
if %ERRORLEVEL% equ 0 (
    echo  [OK] Docker containers stopped.
) else (
    echo  [Notice] Docker containers may not be running or encountered an issue.
)
echo.

echo ===================================================
echo  PHAROS processes have been stopped cleanly.
echo ===================================================
pause
