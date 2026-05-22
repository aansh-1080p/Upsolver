#!/usr/bin/env bash
# CP-Agent — one-command setup script
# Run: bash setup.sh

set -e

echo ""
echo "========================================"
echo "  CP-Agent Setup"
echo "========================================"

# 1. Python venv
echo ""
echo "[1/5] Creating Python virtual environment..."
python3 -m venv venv
source venv/bin/activate

# 2. Install dependencies
echo ""
echo "[2/5] Installing dependencies..."
pip install --upgrade pip -q
pip install -r requirements.txt -q
echo "      Done."

# 3. .env
echo ""
echo "[3/5] Setting up .env ..."
if [ ! -f .env ]; then
    cp .env.example .env
    echo "      Created .env from template."
    echo "      ACTION REQUIRED: open .env and add your GOOGLE_API_KEY"
    echo "      Get a free key at: https://aistudio.google.com"
else
    echo "      .env already exists — skipping."
fi

# 4. output dirs
echo ""
echo "[4/5] Creating output directories..."
mkdir -p output/reports
echo "      Done."

# 5. Docker hint
echo ""
echo "[5/5] LeetCode API (Docker) — optional but recommended:"
echo "      docker run -p 3000:3000 alfaarghya/alfa-leetcode-api:2.0.3"
echo "      (If Docker is unavailable, the code auto-falls back to GraphQL)"

echo ""
echo "========================================"
echo "  Setup complete! Next steps:"
echo ""
echo "  1. Edit .env  — add your GOOGLE_API_KEY"
echo "  2. Run tests:"
echo "     source venv/bin/activate"
echo "     python tests/test_scraper.py --cf <your_cf_handle> --lc <your_lc_username>"
echo ""
echo "  3. Launch Streamlit UI:"
echo "     streamlit run frontend/app.py"
echo "========================================"
