# CP-Agent ⚡

**Agentic Competitive Programming Intelligence Platform**

An autonomous multi-agent system built with **LangGraph** that analyzes your Codeforces and LeetCode profiles, generates detailed performance reports, builds personalized study plans, and finds practice problems — all powered by **Gemini 2.0 Flash** (free tier).

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent framework | LangGraph + LangChain |
| LLM | Gemini 2.0 Flash (free tier) |
| CF data | Codeforces public API (no key) |
| LC data | alfa-leetcode-api (Docker) + GraphQL fallback |
| State persistence | LangGraph SqliteSaver |
| Data analysis | Pandas + NumPy |
| Frontend | React + Vite + Tailwind CSS |
| Extension | Chrome Extension (Manifest V3) |
| Backend API | FastAPI + Uvicorn |
| PDF export | WeasyPrint |

---

## Project Structure

```
LC_CF/
├── agents/                     # LangGraph agents (scraper, analyzer, planner, finder, comparison)
├── tools/                      # API tools (Codeforces, LeetCode, PDF, report)
├── graph/                      # StateGraph wiring & checkpointer
├── frontend-react/             # Upsolver React Web Console
├── extension/                  # Upsolver Chrome Extension (MV3)
├── server.py                   # FastAPI backend server
├── start.sh                    # One-command fullstack launcher
└── requirements.txt
```

---

## Setup

### 1. Install dependencies

```bash
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cd frontend-react && npm install && cd ..
```

### 2. Launch Upsolver

```bash
./start.sh
```
- Web App: `http://localhost:5173`
- Backend API: `http://localhost:8000`


---

## LangGraph Features Used

| Feature | Where |
|---|---|
| `StateGraph` + `TypedDict` state | `graph/state.py`, `graph/graph_builder.py` |
| Node functions | `agents/scraper_agent.py` |
| Conditional edges | `graph/graph_builder.py` (stub, Week 3) |
| `SqliteSaver` checkpointing | `graph/checkpointer.py` |
| `asyncio.gather` parallel tools | `agents/scraper_agent.py` |
| `add_messages` reducer | `graph/state.py` |
| Human-in-the-loop (`interrupt`) | Week 3 — planner agent |
| `.astream_events()` streaming | Week 2 — report generator |

---

## Weekly Build Plan

| Week | Focus | Status |
|---|---|---|
| 1 | Project setup, scraper agent, state schema | ✅ Complete |
| 2 | Analyzer agent + report generator + streaming | 🔲 Upcoming |
| 3 | Supervisor agent + planner with HITL | 🔲 Upcoming |
| 4 | Problem finder + full Streamlit UI + PDF export | 🔲 Upcoming |

---

## Resume Bullet Points

- Built a **multi-agent LangGraph system** with a supervisor orchestrating 4 specialized sub-agents for data scraping, analysis, planning, and problem discovery
- Implemented **Human-in-the-Loop** nodes using LangGraph's `interrupt()` for interactive study plan refinement
- Used **LangGraph SqliteSaver** checkpointing to cache scraped profiles across sessions, eliminating redundant API calls
- Designed **conditional routing logic** to handle 3 distinct user workflows (report / plan / problems) within a single compiled graph
- Streamed LLM-generated report sections token-by-token using **LangGraph's `.astream_events()` API**
- Fetched data concurrently from Codeforces API and LeetCode using **`asyncio.gather()`** inside LangGraph tool nodes
