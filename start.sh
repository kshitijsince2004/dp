#!/usr/bin/env bash
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

echo "==================================================="
echo "    PHAROS Application Startup Script"
echo "==================================================="
echo

echo "[1/6] Starting Docker services (PostgreSQL, RabbitMQ, Redis)..."
docker compose up -d || echo "[Warning] Failed to start Docker services. Make sure Docker is running!"
echo

echo "[2/6] Installing backend dependencies..."
cd "$SCRIPT_DIR/backend"
npm install
echo

echo "[3/6] Running database migrations..."
npm run db:migrate
echo

echo "[4/6] Seeding essential data (fields, users, config)..."
npm run db:seed
echo

echo "[4.5/6] Seeding dev test data (fresh dummy records)..."
node scripts/seed-test-data.js
echo

echo "[5/6] Installing frontend dependencies and starting frontend in a new terminal..."
cd "$SCRIPT_DIR/frontend"
npm install
if command -v gnome-terminal &>/dev/null; then
    gnome-terminal --title="PHAROS Frontend" -- bash -c "cd '$SCRIPT_DIR/frontend' && npm run dev; exec bash"
elif command -v xterm &>/dev/null; then
    xterm -title "PHAROS Frontend" -e "cd '$SCRIPT_DIR/frontend' && npm run dev; bash" &
else
    bash -c "cd '$SCRIPT_DIR/frontend' && npm run dev" &
fi
echo

echo "[5.5/6] Installing Python dependencies and starting report worker..."
cd "$SCRIPT_DIR/python_worker"
if [ ! -d "venv" ]; then
    python -m venv venv
fi
venv/bin/pip install -r requirements.txt
if command -v gnome-terminal &>/dev/null; then
    gnome-terminal --title="PHAROS Python Worker" -- bash -c "cd '$SCRIPT_DIR/python_worker' && venv/bin/python main.py; exec bash"
elif command -v xterm &>/dev/null; then
    xterm -title "PHAROS Python Worker" -e "cd '$SCRIPT_DIR/python_worker' && venv/bin/python main.py; bash" &
else
    bash -c "cd '$SCRIPT_DIR/python_worker' && venv/bin/python main.py" &
fi
echo

echo "[6/6] Starting backend server in a new terminal..."
if command -v gnome-terminal &>/dev/null; then
    gnome-terminal --title="PHAROS Backend" -- bash -c "cd '$SCRIPT_DIR/backend' && npm run dev; exec bash"
elif command -v xterm &>/dev/null; then
    xterm -title "PHAROS Backend" -e "cd '$SCRIPT_DIR/backend' && npm run dev; bash" &
else
    bash -c "cd '$SCRIPT_DIR/backend' && npm run dev" &
fi
echo

echo "==================================================="
echo " PHAROS is starting up!"
echo " Backend:  http://localhost:3000"
echo " Frontend: http://localhost:5173"
echo "==================================================="
