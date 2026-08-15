#!/usr/bin/env bash
# Upsolver: Launch both FastAPI Backend and React Frontend

echo "========================================="
echo "  Starting Upsolver (FastAPI + React)    "
echo "========================================="

# 1. Activate venv
source venv/bin/activate

# 2. Start FastAPI backend on port 8000
echo "⚡ Starting FastAPI backend on http://localhost:8000 ..."
python server.py &
BACKEND_PID=$!

# 3. Start React frontend on port 5173
echo "🚀 Starting React frontend on http://localhost:5173 ..."
cd frontend-react
npm run dev &
FRONTEND_PID=$!

trap "kill $BACKEND_PID $FRONTEND_PID; exit" INT TERM EXIT

echo ""
echo "App is live at: http://localhost:5173"
echo "Backend API at: http://localhost:8000/docs"
echo "Press Ctrl+C to stop both servers."

wait
