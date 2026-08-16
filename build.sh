#!/usr/bin/env bash
# Production build script for Upsolver (FastAPI + React)
set -e

echo "========================================="
echo "  Building Upsolver for Production       "
echo "========================================="

# Auto-activate local venv if it exists and we are not in cloud container
if [ -d "venv" ] && [ -z "$VIRTUAL_ENV" ]; then
  echo "⚡ Activating local venv..."
  source venv/bin/activate
fi

echo "1. Installing Python dependencies..."
pip install -r requirements.txt || pip3 install -r requirements.txt || python3 -m pip install -r requirements.txt

echo "2. Building React Frontend..."
cd frontend-react
npm ci || npm install
npm run build
cd ..

echo "========================================="
echo "  Build successful! Ready to launch.     "
echo "========================================="
