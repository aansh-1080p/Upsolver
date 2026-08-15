# Upsolver

Autonomous Competitive Programming Intelligence Platform and Tactical Browser Companion.

Most competitive programmers approach improvement with a remarkably consistent strategy: solve three random problems, get hit with Wrong Answer on test 2, stare blankly at an editorial, and vow to start a 12-week dynamic programming grind on Monday. Monday never comes.

Upsolver exists because staring at your rating graph while listening to ambient synth music is not an actionable training regimen. It is an agentic analysis engine powered by LangGraph, FastAPI, and modern LLMs that ingests your real contest submissions across Codeforces and LeetCode, diagnoses your actual algorithmic bottlenecks, and synthesizes deliberate practice routines that you might actually follow.

And because opening a separate browser tab is apparently too high of a cognitive barrier when you are tilting after a -75 rating drop, we built both a dedicated industrial web console and a fully featured Chrome Extension.

---

## The Dual-Form Factor

You get the exact same intelligence suite in two distinct formats:

### 1. The Industrial Web Console (React + Vite + Tailwind)
A tactile, Dieter Rams and Teenage Engineering-inspired command center. It features dual 45-degree neumorphic shadow fields, recessed input wells, mechanical button press physics, glowing LED status diodes, and zero minimalist whitespace fluff. It looks and feels like a piece of high-precision laboratory hardware calibrated specifically to inform you that your graph traversal accuracy is embarrassing.

### 2. The Chrome Extension (Manifest V3 Popup)
We packaged the entire dashboard into an 800x600 browser popup. Whether you are actively competing on Codeforces, grinding daily LeetCode challenges, or lurking on a rival's profile, the extension provides instantaneous access to:
- Live telemetry and structured evaluation briefings without tab-switching.
- Multi-platform contest rating progression graphs with interactive Codeforces vs LeetCode toggles.
- Friends Roster & Live Rating Tracker: Keep tabs on your peers' ratings across both platforms without manual lookups.
- One-Click Head-to-Head Peer Duels: Click a button next to any friend's name to instantly simulate an algorithmic differential analysis and see whose dynamic programming skills are actually carrying the team.

---

## Core Capabilities

### Algorithmic Autopsy (Component Report)
No raw markdown dumps or generic advice. Upsolver breaks down your profile into dedicated component telemetry:
- Executive Snapshot: High-level overview of contest velocity, rating tiers, and submission cadence.
- Bottleneck Identification: Direct measurement of Wrong Answer (WA%) vs Time Limit Exceeded (TLE%) failure rates and high-fatigue submission windows.
- Tactical Directives: Specific algorithmic weaknesses prioritized by error rate and attempt volume, paired with your calibrated peak solving hours.
- Dual-Platform Rating Curves: Interactive visual trajectories for both Codeforces ELO and LeetCode contest rating history.

### Dynamic Curriculum Synthesis (with Human-in-the-Loop)
Tell the AI your weekly availability and target rating goals. It generates a multi-week, structured curriculum targeting your exact weak topics with verified platform problems.
- Don't like the proposed focus on Segment Trees? Hit the Revise button, type your natural language adjustments, and the planner node recalibrates the syllabus while preserving your verified progress.
- Save and export customized plans locally or to PDF.

### Precision Problem Matrix
A tactical problem finder equipped with a physical 3-position difficulty switch (Easy, Medium, Hard), platform filters, and live tag filtering. It serves targeted practice problems tailored to your current rating boundary rather than throwing 3000-rated monstrosities at you.

### Head-to-Head Benchmark Duels
Compare your profile against any competitor or benchmark handle (like tourist, if you enjoy emotional damage). Upsolver calculates rating deltas, identifies shared weak spots where both of you struggle, and highlights algorithmic categories where you hold a statistical edge.

---

## Tech Stack

| Layer | Technology | Purpose |
|---|---|---|
| Multi-Agent Orchestration | LangGraph + LangChain Core | Cyclic graph execution, checkpointing, and state management |
| Reasoning Models | Gemini 2.0 Flash / Groq (Qwen-32B) | Algorithmic telemetry reasoning and curriculum synthesis |
| Backend API | FastAPI + Uvicorn | High-throughput asynchronous REST endpoints |
| Web Frontend | React 19 + Vite + Tailwind CSS v4 | Industrial skeuomorphic tactile interface and Recharts telemetry |
| Browser Extension | Chrome Extension (Manifest V3) | Standalone popup console with chrome.storage persistence |
| Data Scraping | Asynchronous HTTPX + LeetCode GraphQL | Parallel multi-platform profile, contest, and submission ingestion |

---

## Architecture Overview

```
LC_CF/
├── agents/                     # LangGraph agents (scraper, analyzer, planner, finder, comparison)
├── tools/                      # Platform ingestion tools (Codeforces, LeetCode GraphQL, report formatters)
├── graph/                      # StateGraph wiring and checkpoint persistence
├── frontend-react/             # React web console (Vite + Tailwind CSS v4)
│   ├── src/components/         # Modular industrial components (Report, Plan, Problems, Compare)
│   └── src/index.css           # Industrial skeuomorphic design system & tactile tokens
├── extension/                  # Manifest V3 Chrome Extension
│   ├── popup/                  # Standalone 800x600 console (HTML, CSS, JS)
│   └── manifest.json           # MV3 extension configuration
├── server.py                   # FastAPI backend server
├── start.sh                    # Unified launcher for backend and frontend
└── requirements.txt            # Python dependencies
```

---

## Installation and Quickstart

### Prerequisites
- Python 3.10+
- Node.js 18+ and npm
- A free API key from Google AI Studio or Groq

### 1. Clone the Repository

```bash
git clone https://github.com/aansh-1080p/Upsolver.git
cd Upsolver
```

### 2. Backend Setup

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 3. Environment Configuration

Copy the example configuration and add your preferred API key:

```bash
cp .env.example .env
```

Open `.env` and configure at least one LLM key:

```ini
# Option A (Recommended): Free key from https://console.groq.com
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=qwen/qwen3-32b

# Option B: Free key from https://aistudio.google.com
GOOGLE_API_KEY=your_google_api_key_here
```

### 4. Web Console Setup

```bash
cd frontend-react
npm install
cd ..
```

### 5. Launch Everything

Run the root start script to spin up both the FastAPI backend and the React web console:

```bash
./start.sh
```

- Web App: `http://localhost:5173`
- Backend API Docs: `http://localhost:8000/docs`

---

## Installing the Chrome Extension

1. Ensure the FastAPI backend is running (`./start.sh` or `python server.py`).
2. Open Google Chrome and navigate to `chrome://extensions`.
3. Enable **Developer mode** in the top right corner.
4. Click **Load unpacked** in the top left.
5. Select the `extension/` folder inside the `Upsolver` directory.
6. Pin Upsolver to your browser toolbar and click the icon to open the console anytime you are solving problems.

---

## CLI Usage

If you prefer operating strictly from the terminal:

```bash
source venv/bin/activate

# Generate a diagnostic performance report
python main.py --cf tourist --lc neal_wu --intent report

# Generate a study plan
python main.py --cf tourist --intent plan --weeks 4 --hours 10

# Find targeted practice problems
python main.py --cf tourist --intent problems --difficulty medium

# Run a head-to-head comparison
python main.py --cf tourist --peer-cf Benq --intent compare
```

---

##  Built for competitive programmers who are tired of guessing why their code passed 44 out of 45 test cases.
