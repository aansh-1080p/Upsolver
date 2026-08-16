#!/usr/bin/env bash
# Production build script for Upsolver (FastAPI + React)
set -e

echo "========================================="
echo "  Building Upsolver for Production       "
echo "========================================="

echo "1. Installing Python dependencies..."
if command -v pip3 &>/dev/null; then
  pip3 install -r requirements.txt
elif command -v pip &>/dev/null; then
  pip install -r requirements.txt
else
  python3 -m pip install -r requirements.txt
fi

echo "2. Building React Frontend..."
cd frontend-react
npm ci || npm install
npm run build
cd ..

echo "========================================="
echo "  Build successful! Ready to launch.     "
echo "========================================="
