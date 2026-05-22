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
| Frontend | Streamlit |
| PDF export | WeasyPrint |

---

## Project Structure

```
cp-agent/
├── agents/
│   ├── __init__.py
│   └── scraper_agent.py        # Week 1: parallel CF + LC fetch
├── tools/
│   ├── __init__.py
│   ├── codeforces_tools.py     # CF API async functions
│   └── leetcode_tools.py       # LC API with auto-fallback to GraphQL
├── graph/
│   ├── __init__.py
│   ├── state.py                # AgentState TypedDict (shared state)
│   ├── checkpointer.py         # SqliteSaver setup
│   └── graph_builder.py        # StateGraph wiring
├── frontend/
│   └── app.py                  # Streamlit UI
├── output/
│   └── reports/                # Generated PDFs
├── tests/
│   └── test_scraper.py         # Week 1 test suite
├── main.py                     # CLI entry point
├── requirements.txt
└── .env.example
```

---

## Setup

### 1. Clone & install dependencies

```bash
git clone https://github.com/yourname/cp-agent.git
cd cp-agent
python -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env and add your Gemini API key:
# GOOGLE_API_KEY=your_key_here
# Get it free at: https://aistudio.google.com
```

### 3. Start the LeetCode API (Docker)

```bash
docker run -p 3000:3000 alfaarghya/alfa-leetcode-api:2.0.3
```

> If Docker isn't available, the code automatically falls back to LeetCode's GraphQL API.

---

## Usage

### Run tests (Week 1)

```bash
python tests/test_scraper.py --cf <your_cf_handle> --lc <your_lc_username>
```

### CLI

```bash
python main.py --cf tourist --lc neal_wu --intent report
```

### Streamlit UI

```bash
streamlit run frontend/app.py
```

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
