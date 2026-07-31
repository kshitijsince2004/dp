@echo off
echo ===================================================
echo     PHAROS Application Startup Script
echo ===================================================
echo.

echo [1/6] Starting Docker services (PostgreSQL, RabbitMQ, Redis)...
docker compose up -d
if %ERRORLEVEL% neq 0 (
    echo [Warning] Failed to start Docker services. Make sure Docker Desktop is running!
)
echo.

echo [2/6] Installing backend dependencies...
cd backend
call npm install
echo.

echo [3/6] Running database migrations...
call npm run db:migrate
echo.

echo [4/6] Seeding essential data (fields, users, config)...
call npm run db:seed
echo.

echo [4.5/6] Seeding dev test data (fresh dummy records)...
node scripts/seed-test-data.js
echo.

echo [4.6/6] Auto-updating import template baseline...
node scripts/template-regression.js baseline
echo.

echo [5/6] Starting frontend in a new terminal...
start "PHAROS Frontend" cmd /k "cd /d %~dp0frontend && npm run dev"
echo.

echo [5.5/6] Installing Python dependencies and starting report worker...
cd /d %~dp0python_worker
pip install -r requirements.txt
start "PHAROS Python Worker" cmd /k "cd /d %~dp0python_worker && python main.py"
cd /d %~dp0
echo.

echo [5.8/6] Freeing port 3000 if occupied...
for /f "tokens=5" %%a in ('netstat -aon 2^>nul ^| findstr :3000 ^| findstr LISTENING 2^>nul') do taskkill /f /pid %%a >nul 2>&1
echo.

echo [6/6] Starting backend server in a new terminal...
start "PHAROS Backend" cmd /k "cd /d %~dp0backend && npm run dev"
echo.

echo ===================================================
echo  PHAROS is starting up!
echo  Backend:  http://localhost:3000
echo  Frontend: http://localhost:5173
echo ===================================================
