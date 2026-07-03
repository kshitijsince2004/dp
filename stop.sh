#!/usr/bin/env bash
# stop.sh — Kill all running PHAROS processes cleanly.
# Safe to run even if nothing is running.

PORTS=(5000 5173 5174 5175 5176 5177 5178 5179 5180)

echo "Stopping PHAROS processes..."

# Kill by process name patterns
pkill -f "nodemon index.js"        2>/dev/null && echo "  ✓ Backend (nodemon) stopped"    || true
pkill -f "node index.js"           2>/dev/null && echo "  ✓ Backend (node) stopped"       || true
pkill -f "vite"                    2>/dev/null && echo "  ✓ Frontend (vite) stopped"      || true
pkill -f "python_worker/main.py"   2>/dev/null && echo "  ✓ Python worker stopped"        || true
pkill -f "python main.py"          2>/dev/null                                             || true

# Kill anything still holding the known ports
for PORT in "${PORTS[@]}"; do
  PIDS=$(lsof -ti tcp:"$PORT" 2>/dev/null)
  if [ -n "$PIDS" ]; then
    echo "  ✓ Killing stale process on port $PORT (PID $PIDS)"
    kill -9 $PIDS 2>/dev/null || true
  fi
done

echo "Done."
