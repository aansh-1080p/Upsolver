# CP-Agent — Architecture & Technical Deep-Dive

> **Goal:** Demonstrate mastery of LangGraph, LangChain, and Agentic AI by building
> a real-world multi-agent system that analyzes competitive programming profiles,
> generates performance reports, builds personalized study plans with human review,
> and finds practice problems — all powered by a stateful, resumable agent graph.

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [LangGraph — Why and How](#2-langgraph--why-and-how)
3. [Agent Graph — Full Flow](#3-agent-graph--full-flow)
4. [Each Agent — Implementation Detail](#4-each-agent--implementation-detail)
5. [LangChain Tools Layer](#5-langchain-tools-layer)
6. [State Management](#6-state-management)
7. [LLM Layer — Multi-Model with Retry](#7-llm-layer--multi-model-with-retry)
8. [Human-in-the-Loop (HITL)](#8-human-in-the-loop-hitl)
9. [Checkpointing and Persistence](#9-checkpointing-and-persistence)
10. [Problem Finder — Multi-Source Search](#10-problem-finder--multi-source-search)
11. [Frontend — Streamlit with Streaming](#11-frontend--streamlit-with-streaming)
12. [Tech Stack Summary](#12-tech-stack-summary)
13. [Key Design Decisions](#13-key-design-decisions)
14. [Resume Bullet Points](#14-resume-bullet-points)

---

## 1. System Overview

CP-Agent is a **multi-agent system** where specialized AI agents collaborate
through a shared typed state to complete a user's request end to end.

A user types a request like *"make me a 4-week study plan"*. The system:

1. **Supervisor** classifies the intent (`plan`)
2. **Scraper** fetches live data from Codeforces API and LeetCode GraphQL
3. **Analyzer** runs pandas computations and calls an LLM to generate insights
4. **Planner** calls an LLM to generate a week-by-week JSON study plan
5. **HITL node** pauses the graph, shows the draft plan in Streamlit, waits for
   user approval or revision feedback
6. If revised → Planner re-generates with feedback incorporated (cycle)
7. If approved → graph completes, final plan stored in state

Each agent is a **pure Python function** registered as a LangGraph node.
The framework handles routing, state merging, persistence, and resumption.

---

## 2. LangGraph — Why and How

### Why LangGraph over plain LangChain?

LangChain gives you LLM wrappers and chains. LangGraph adds:

| Feature | LangChain | LangGraph |
|---|---|---|
| Shared state across steps | Manual | `TypedDict` state built-in |
| Conditional routing | Code glue | `add_conditional_edges()` |
| Cycles / loops | Not supported | First-class (planner → hitl → planner) |
| Human-in-the-loop pause | Not supported | `interrupt()` built-in |
| Persist and resume | Not supported | `SqliteSaver` checkpointing |
| Parallel node execution | Not supported | Native async support |
| Streaming node outputs | Limited | `.stream(mode="updates")` |

### How LangGraph is used here

```python
# graph/graph_builder.py

builder = StateGraph(AgentState)          # typed state container

builder.add_node("supervisor",       supervisor_node)
builder.add_node("scraper",          scraper_node)
builder.add_node("analyzer",         analyzer_node)
builder.add_node("report_generator", report_generator_node)
builder.add_node("planner",          planner_node)
builder.add_node("hitl",             hitl_node)         # HITL interrupt
builder.add_node("problem_finder",   problem_finder_node)

# Fixed edges
builder.add_edge(START,        "supervisor")
builder.add_edge("supervisor", "scraper")
builder.add_edge("scraper",    "analyzer")

# Conditional edges — routing based on state["intent"]
builder.add_conditional_edges("analyzer", route_after_analyzer, {
    "report_generator": "report_generator",
    "planner":          "planner",
    "problem_finder":   "problem_finder",
})

# Cycle: planner → hitl → planner (for revision loop)
builder.add_edge("planner", "hitl")
builder.add_conditional_edges("hitl", route_after_hitl, {
    "planner": "planner",   # revise path — cycle back
    END:       END,         # approve path — done
})

graph = builder.compile(checkpointer=get_checkpointer())
```

**Every LangGraph feature used:**

| Feature | File | Purpose |
|---|---|---|
| `StateGraph` | `graph_builder.py` | Core graph container |
| `TypedDict` state | `state.py` | Shared state across all nodes |
| `add_conditional_edges` | `graph_builder.py` | Intent-based routing |
| Cycle (planner→hitl→planner) | `graph_builder.py` | HITL revision loop |
| `interrupt()` | `planner_agent.py` | Suspend at HITL node |
| `SqliteSaver` checkpointing | `checkpointer.py` | Persist across restarts |
| `graph.stream(mode="updates")` | `app.py` | Per-node progress streaming |
| `graph.get_state()` | `app.py` | Read state after interrupt |
| `graph.update_state()` | `app.py` | Inject HITL user decision |
| `graph.stream(None, ...)` | `app.py` | Resume after interrupt |

---

## 3. Agent Graph — Full Flow

```
User request (Streamlit or CLI)
           │
           ▼
    ┌─────────────┐
    │  Supervisor  │  ← LLM classifies intent + keyword fallback
    └──────┬──────┘
           │  intent set in state
           ▼
    ┌─────────────┐
    │   Scraper    │  ← asyncio.gather (CF API + LC GraphQL concurrently)
    └──────┬──────┘    checkpoint cache: skip if data already in state
           │
           ▼
    ┌─────────────┐
    │   Analyzer   │  ← pandas: tag weakness, WA rate, consistency score
    └──────┬──────┘    LLM: 3-paragraph narrative with retry/fallback
           │
     ┌─────┴──────────────────────┐
     │  conditional on intent     │
     ├──────────────────────────  │
     │  "report"                  │  "plan"                  "problems"
     ▼                            ▼                          ▼
┌──────────────┐         ┌──────────────┐          ┌──────────────────┐
│   Report     │         │   Planner    │◄─────┐   │  Problem Finder  │
│  Generator   │         │  (LLM JSON)  │      │   │  CF+CSES+LC      │
└──────┬───────┘         └──────┬───────┘      │   └────────┬─────────┘
       │  intent=all            │              │            │
       │  also goes to          ▼              │            ▼
       │  planner        ┌──────────────┐  revise          END
       └────────────────►│  HITL node   │──────┘
                         │ interrupt()  │
                         └──────┬───────┘
                                │ approve
                                ▼
                               END
```

---

## 4. Each Agent — Implementation Detail

### 4.1 Supervisor Agent (`agents/supervisor.py`)

**What it does:** Reads `state["messages"]` and classifies the user's intent
into one of four categories: `report`, `plan`, `problems`, `all`.

**How it works:**
- Sends a strict one-word-answer prompt to the LLM
- Uses `get_text_from_llm()` to strip `<think>` blocks from reasoning models
- Regex matches the valid intent word from the cleaned response
- Falls back to fast keyword matching if the LLM fails or returns noise
- In CLI mode (no messages in state), respects the `--intent` flag directly

**Why this design:** The supervisor decouples intent detection from all other
agents. Adding a new intent category only requires changing the supervisor and
adding a new node — no other agent changes.

```python
# agents/supervisor.py — core logic
def _classify(user_message: str) -> str:
    raw   = call_llm([HM(content=prompt)], temperature=0.0)
    clean = get_text_from_llm(raw).lower()              # strips <think> blocks
    match = re.search(r"\b(report|plan|problems|all)\b", clean)
    return match.group(1) if match else _keyword_fallback(user_message)
```

---

### 4.2 Scraper Agent (`agents/scraper_agent.py`)

**What it does:** Fetches all raw data from Codeforces and LeetCode concurrently.

**How it works:**
- Checks if data already exists in state (loaded from checkpoint) → skip re-fetch
- Uses `asyncio.gather()` inside a sync node via `_run_async()` — safely runs
  async code whether or not a LangGraph event loop is already running
- CF: hits `codeforces.com/api/user.info`, `user.rating`, `user.status`
- LC: hits LeetCode GraphQL for profile, contest, submissions, skills, calendar
- `return_exceptions=True` in gather — one API failure never crashes the whole node

**Key pattern — loop-safe async in a sync node:**
```python
def _run_async(coro):
    try:
        loop = asyncio.get_running_loop()   # LangGraph may have one running
    except RuntimeError:
        loop = None
    if loop is None:
        return asyncio.run(coro)            # safe: no active loop
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()  # new thread = new loop
```

---

### 4.3 Analyzer Agent (`agents/analyzer_agent.py`)

**What it does:** Transforms raw JSON data into structured analysis using pandas,
then generates a coaching narrative using an LLM.

**Pandas computations:**
- Submissions DataFrame → tag-level failure rate per tag (attempts ≥ 3 filter)
- Peak solving hour from Unix timestamps → `datetime.fromtimestamp().hour`
- WA rate and TLE rate from verdict column value counts
- Consistency score: count days active in last 90 days from LC submission calendar
- LC skill tag weak/strong via `DataFrame.nsmallest/nlargest`

**LLM usage:**
- Passes computed stats as structured text into a tightly constrained prompt
- Three specific paragraphs: snapshot, weaknesses, concrete actions
- Uses `call_llm()` which handles Gemini 429 with retry + model fallback

**Why pandas over pure Python:** Vectorized groupby operations are 10-50x
faster on submission lists of 200+ entries. Also makes the analysis pipeline
readable and testable.

---

### 4.4 Report Generator (`tools/report_tools.py`)

**What it does:** Builds a Markdown report from `state["analysis"]` + raw data,
then converts to PDF via WeasyPrint.

**How it works:**
- Pure f-string template — no external templating engine needed
- Sections: Summary (LLM narrative), Key Metrics table, CF Contest History,
  Weak Topics, Strong Topics, LC Advanced Tags
- `markdown` library converts Markdown → HTML
- WeasyPrint renders HTML → PDF with custom CSS
- File saved to `output/reports/{handle}_{date}.md` and `.pdf`

**Streaming:** The Streamlit frontend displays the report word-by-word using
`st.empty()` with a `placeholder.markdown(displayed + "▌")` loop, simulating
LLM token streaming even though the report is generated all at once.

---

### 4.5 Planner Agent + HITL Node (`agents/planner_agent.py`)

**What it does:** Generates a week-by-week JSON study plan, then pauses for
user review. The user can approve or request changes — triggering a re-generation
cycle.

**Planner node — LLM JSON generation:**
- Prompt forces strict JSON: `"Start with { and end with }"` — no preamble
- `call_llm()` → `parse_json_from_llm()` → strips `<think>` → finds `{...}` with regex
- Fallback plan if LLM fails: uses weak topics directly with CP-algorithms links
- HITL feedback folded into the goal string on re-generation

**HITL node — the core LangGraph pattern:**
```python
def hitl_node(state: AgentState) -> dict:
    plan = state.get("plan") or {}
    if plan.get("status") == "approved":
        return {}   # passthrough

    # interrupt() suspends the graph here and saves checkpoint
    user_feedback = interrupt({
        "message": "Review your study plan.",
        "plan":    plan,
    })
    # execution resumes here after graph.update_state() + graph.stream(None)

    if action == "approve":
        return {"plan": {**plan, "status": "approved"}}
    return {"plan": {**plan, "status": "draft", "user_feedback": feedback}}
```

**The cycle:** `route_after_hitl()` returns `"planner"` if status is still
`"draft"` → planner re-generates with the feedback → hitl pauses again.
This is a true cycle in the graph, not a loop in application code.

---

### 4.6 Problem Finder Agent (`agents/problem_finder_agent.py`)

**What it does:** Finds unsolved practice problems from CF, CSES, and LeetCode
matching the user's weak topics.

**Tag normalization — the critical fix:**
CF uses tags like `"dfs and similar"`, `"dsu"`, `"sortings"`.
These don't match CSES tags or LC slug strings.

```python
# tools/search_tools.py
_CF_TO_CANONICAL = {
    "dfs and similar": "graphs",
    "dsu":             "union find",
    "sortings":        "sorting",
    "shortest paths":  "shortest path",
    ...
}
# canonical → LC slug
_CANONICAL_TO_LC_SLUG = {
    "graphs":     "graph",
    "union find": "union-find",
    "sorting":    "sorting",
    ...
}
```

CF API queries use original CF tags (it understands them).
CSES matching uses canonical tags (list is tagged canonically).
LC GraphQL uses canonical → LC slug conversion.

**Parallel fetch:**
```python
cf_res, cses_res, lc_res = await asyncio.gather(
    fetch_cf_problems(cf_tags, ...),
    _cses(),                           # synchronous, wrapped as coroutine
    fetch_lc_problems(canonical_tags, ...),
    return_exceptions=True,
)
```

**Solved-problem filtering:** Builds a set of `problem_name.lower()` from CF
accepted submissions and `titleSlug.lower()` from LC accepted submissions.
Filters every fetched problem against this set.

**Relevance scoring:** Counts how many weak tags each problem's tags share
with the user's canonical weak tags. Higher score = shown first.

---

## 5. LangChain Tools Layer

LangChain's `httpx`-based tools are used for all data fetching. Each tool is
an async function that returns a plain Python dict, making them testable
independently of LangGraph.

### Codeforces Tools (`tools/codeforces_tools.py`)

| Function | Endpoint | Returns |
|---|---|---|
| `fetch_cf_user_info` | `user.info` | rating, rank, maxRating |
| `fetch_cf_rating_history` | `user.rating` | contest history with rating changes |
| `fetch_cf_submissions` | `user.status` | last 200 submissions with tags + verdicts |
| `fetch_all_cf_data` | all three above | combined dict via `asyncio.gather` |

No API key needed — CF's API is fully public.

### LeetCode Tools (`tools/leetcode_tools.py`)

GraphQL-only (alfa-leetcode-api Docker dependency removed).
All five fetchers run concurrently inside `fetch_all_lc_data()`:

| Function | GraphQL query | Returns |
|---|---|---|
| `fetch_lc_profile` | `getUserProfile` | ranking, solved by difficulty |
| `fetch_lc_contest` | `getUserContestRanking` | rating, history |
| `fetch_lc_submissions` | `recentAcSubmissionList` | last 50 AC submissions |
| `fetch_lc_skills` | `skillStats` | tag-wise solved counts |
| `fetch_lc_calendar` | `userProfileCalendar` | daily activity heatmap |

---

## 6. State Management

The entire system shares a single `AgentState` TypedDict. Every node receives
the full state and returns only the fields it modifies — LangGraph merges them.

```python
# graph/state.py
class AgentState(TypedDict):
    # Input
    cf_username: str
    lc_username: str
    intent: str                      # "report"|"plan"|"problems"|"all"

    # Scraped data (populated by scraper_node)
    cf_data: Optional[CFData]
    lc_data: Optional[LCData]

    # Computed (populated by analyzer_node)
    analysis: Optional[Analysis]

    # Outputs (populated by downstream nodes)
    plan: Optional[dict]
    problems: Optional[list[dict]]
    report_markdown: Optional[str]
    report_pdf_path: Optional[str]

    # HITL preferences
    user_prefs: Optional[UserPrefs]

    # Cross-cutting
    errors: list[str]
    messages: Annotated[list, add_messages]  # LangChain message reducer
```

The `Annotated[list, add_messages]` field uses LangChain's built-in message
reducer — it appends new messages rather than overwriting, which is the correct
behaviour for a conversational system.

---

## 7. LLM Layer — Multi-Model with Retry

### Problem: Gemini 429 RESOURCE_EXHAUSTED

The free tier hits two limits:
- **RPM limit** — recoverable with a short wait (10–60 seconds)
- **Daily quota** — requires switching to a different model

The old code had no retry or fallback, so quota exhaustion broke the whole
system silently (narrative showed the raw error in the report).

### Solution: `call_llm()` in `agents/llm_utils.py`

```python
def call_llm(messages: list, temperature: float = 0.3) -> str:
    # Groq path: single call, no retry needed
    if groq_key:
        return _call_groq(messages, temperature)

    # Gemini path: retry + model fallback chain
    for model in ["gemini-2.0-flash", "gemini-1.5-flash", "gemini-2.0-flash-lite"]:
        for attempt, delay in enumerate([10, 30, 60], start=1):
            try:
                llm  = ChatGoogleGenerativeAI(model=model, ...)
                resp = llm.invoke(messages)
                return resp.content
            except Exception as e:
                if _is_quota_error(e):
                    time.sleep(delay)   # wait and retry
                else:
                    break               # non-quota error, try next model
    return ""   # all options exhausted — callers handle empty string
```

### Model Priority

```
GROQ_API_KEY set?
  └─ YES → ChatGroq (qwen/qwen3-32b or GROQ_MODEL from .env)
  └─ NO  → Gemini chain:
              gemini-2.0-flash  (try 3x with backoff)
                  ↓ quota exhausted
              gemini-1.5-flash  (try 3x with backoff)
                  ↓ quota exhausted
              gemini-2.0-flash-lite (try 3x with backoff)
                  ↓ all exhausted → empty string → caller uses fallback
```

### Think-Tag Stripping

Reasoning models (Qwen3, DeepSeek-R1, o1) wrap responses in `<think>...</think>`.
Every text response goes through `get_text_from_llm()` which strips these.
Every JSON response goes through `parse_json_from_llm()` which strips them
and additionally uses `re.search(r"\{.*\}", ...)` to find the JSON object
inside whatever text the model returns.

---

## 8. Human-in-the-Loop (HITL)

HITL is the most advanced LangGraph feature in this project. It allows the
graph to **pause mid-execution**, hand control to a human, and **resume from
the exact same point** after the human responds.

### The mechanism

```
graph.stream(initial_state, config)
    │
    ├── supervisor node runs
    ├── scraper node runs
    ├── analyzer node runs
    ├── planner node runs → state["plan"]["status"] = "draft"
    ├── hitl node starts
    │     └── interrupt() ← GRAPH PAUSES HERE
    │           State is saved to SQLite checkpoint
    │           Exception propagates to caller
    │
    [Streamlit catches the exception, shows draft plan to user]
    [User clicks Approve or types feedback]
    │
    graph.update_state(config, {"plan": {..., "status": "approved"}}, as_node="hitl")
    │   Injects user decision into checkpoint
    │
    graph.stream(None, config)   ← RESUME FROM CHECKPOINT
    │
    ├── hitl node finishes (reads injected state)
    └── route_after_hitl → END (approved) or planner (revise)
```

### The revision cycle

If the user requests revision, `route_after_hitl()` returns `"planner"`,
causing LangGraph to call `planner_node` again. The planner reads
`state["plan"]["user_feedback"]`, folds it into the goal, and regenerates.
Then `hitl_node` pauses again. This is a true directed cycle in the graph —
not application-level looping.

### Why this matters for the resume

This demonstrates understanding of:
- LangGraph's stateful execution model
- Checkpoint-based resumption
- Human oversight in agentic systems
- The `interrupt()` / `update_state()` / `stream(None)` pattern

---

## 9. Checkpointing and Persistence

### SqliteSaver (`graph/checkpointer.py`)

```python
conn = sqlite3.connect("./output/checkpoints.db", check_same_thread=False)
return SqliteSaver(conn)
```

Every graph execution is saved to a SQLite database keyed by `thread_id`.
The thread_id is derived from `f"cp-agent-{cf_username}-{lc_username}"`,
so each user pair gets its own isolated checkpoint history.

### Benefits

1. **Caching:** On the second run with the same handles, the scraper detects
   `state["cf_data"]` is already populated from the checkpoint and skips
   the API calls. Saves 5-10 seconds per run.

2. **HITL resumption:** The graph can pause for hours (or across server restarts)
   and resume exactly where it stopped. The checkpoint preserves the entire
   state including the draft plan waiting for approval.

3. **Debugging:** You can inspect any past run's state by querying the SQLite
   database directly.

### Fallback to MemorySaver

If `langgraph-checkpoint-sqlite` is not installed, the checkpointer
automatically falls back to `MemorySaver` (in-process, no disk persistence).
The graph still works — just no cross-restart caching or HITL resumption.

---

## 10. Problem Finder — Multi-Source Search

### Why three sources

| Source | Strength | Weakness |
|---|---|---|
| Codeforces | Huge variety, exact difficulty rating, tag filtering | Tags don't match LC format |
| CSES | Curated classics, all important algorithm topics | Fixed 80-problem list, no API |
| LeetCode | Interview-style, great for arrays/strings/DP | Rate limits, tag slugs differ from CF |

Combining all three gives the user a broad, high-quality problem set across
different problem styles.

### The GraphQL query that actually works

The old code used a broken `problemsetQuestionList` query structure.
The working query:

```graphql
query problemsetQuestionList(
  $categorySlug: String
  $limit: Int
  $skip: Int
  $filters: QuestionListFilterInput
) {
  questionList(
    categorySlug: $categorySlug
    limit: $limit
    skip: $skip
    filters: $filters
  ) {
    totalNum
    data {
      title
      titleSlug
      difficulty
      topicTags { name slug }
    }
  }
}
```

Variables: `{ "categorySlug": "", "filters": { "tags": ["dynamic-programming"] } }`

The key difference: `questionList(...)` not `problemsetQuestionList(...)`,
and `data { ... }` not `questions { ... }`.

---

## 11. Frontend — Streamlit with Streaming

### Three-tab design

```
Tab 1: Performance Report
  → Generate Report button
  → Progress bar updating per LangGraph node
  → Word-by-word report streaming (simulated)
  → CF rating chart, weak topics table
  → PDF download button

Tab 2: Study Plan (HITL)
  → Generate Plan button
  → Graph streams until interrupt() pause
  → Draft plan displayed in expandable week cards
  → Approve button → resumes graph → done
  → Feedback textarea + Revise → re-runs planner → HITL again

Tab 3: Practice Problems
  → Find Problems button
  → Shows platform-grouped results (CF / CSES / LC)
  → Platform filter + tag text filter
  → Color-coded difficulty, relevance stars, clickable links
```

### Per-node progress with `graph.stream(mode="updates")`

```python
for event in graph.stream(initial, config=config, stream_mode="updates"):
    node = list(event.keys())[0]     # which node just finished
    if node == "scraper":
        bar.progress(30, text="Fetching profiles...")
    elif node == "analyzer":
        bar.progress(65, text="Analysing performance...")
```

Each event is a dict `{node_name: state_update}` — LangGraph emits one per
completed node. This gives accurate per-step progress without polling.

### HITL state machine in Streamlit

`st.session_state.plan_stage` tracks where the user is:
- `"idle"` → show Generate button
- `"running"` → stream graph, catch interrupt
- `"waiting_hitl"` → show draft plan + Approve / Revise UI
- `"done"` → show final approved plan

`st.rerun()` transitions between stages. This is the correct Streamlit pattern
for multi-step interactions — the entire script re-runs on each interaction,
and `session_state` preserves the current stage.

---

## 12. Tech Stack Summary

| Layer | Technology | Why |
|---|---|---|
| **Agent framework** | LangGraph 0.2+ | Stateful multi-agent graphs, cycles, HITL, checkpointing |
| **LLM abstraction** | LangChain Core | Message types, LLM interfaces, consistent API across providers |
| **LLM — primary** | Groq (qwen3-32b / llama-3.3-70b) | Free tier, fast, no daily quota issues |
| **LLM — fallback** | Gemini 2.0 Flash → 1.5 Flash → Flash-Lite | Free tier with retry chain |
| **CF data** | Codeforces public REST API | No key needed, full submission + rating history |
| **LC data** | LeetCode GraphQL | Public endpoint, covers all required data |
| **Data analysis** | Pandas + NumPy | Tag-level failure rates, peak hours, consistency score |
| **Async fetch** | httpx + asyncio | Non-blocking concurrent API calls |
| **State persistence** | SQLite (SqliteSaver) | HITL resumption, scraper caching |
| **Frontend** | Streamlit | Rapid UI, native st.session_state for HITL state machine |
| **PDF export** | WeasyPrint + markdown | HTML → PDF with custom CSS |
| **Config** | python-dotenv | Environment-based key management |

---

## 13. Key Design Decisions

### Decision 1: Sync nodes with async internals
LangGraph nodes must be sync functions when using `graph.stream()`.
But CF and LC fetchers are naturally async. Solution: `_run_async()` detects
whether a loop is already running and either uses `asyncio.run()` directly
or submits to a `ThreadPoolExecutor` with its own loop. This works correctly
in Streamlit, LangGraph, and plain Python scripts.

### Decision 2: Groq preferred over Gemini
Groq's free tier has no daily token quota — only an RPM limit. This makes
it far more reliable for development. The `get_llm()` factory checks for
`GROQ_API_KEY` first, so switching is a one-line `.env` change.

### Decision 3: Tag normalization as a separate concern
CF tags, CSES tags, and LC slugs are three different vocabularies.
Rather than hacking each fetcher, we define a canonical vocabulary and
normalize at the boundary. This means adding a new platform requires only
adding a mapping dict — no changes to the agent.

### Decision 4: Fallback plan for LLM failures
The planner always produces output — if the LLM fails, a hardcoded plan
using the weak topics is returned. This makes the system resilient to
quota exhaustion without showing an error to the user.

### Decision 5: State field `_cf` and `_lc` inside analysis
The analyzer stores its internal computed stats under `_cf` and `_lc` keys
inside `state["analysis"]`. This avoids duplicating fields in the state schema
while giving the report generator access to computed values (avg_rating_change,
wa_rate etc.) without re-computing them.

---

## 14. Resume Bullet Points

These are accurate, specific, and verifiable — each maps to code in this repo:

- **Built a multi-agent LangGraph system** with 6 specialized nodes (supervisor,
  scraper, analyzer, report generator, planner, problem finder) connected via
  conditional edges and a planner→HITL→planner revision cycle

- **Implemented Human-in-the-Loop** using LangGraph's `interrupt()` + `update_state()`
  + `stream(None)` pattern, enabling a study plan to be paused for user review
  and resumed from a SQLite checkpoint across Streamlit requests

- **Built a multi-model LLM retry chain** that handles Gemini 429 RESOURCE_EXHAUSTED
  with exponential backoff (10s/30s/60s) and automatic model fallback across
  gemini-2.0-flash → 1.5-flash → flash-lite, with Groq as the primary option

- **Implemented parallel API data fetching** using `asyncio.gather` with
  `return_exceptions=True` across Codeforces REST API and LeetCode GraphQL,
  running inside sync LangGraph nodes via a loop-safe `ThreadPoolExecutor` wrapper

- **Designed a tag normalization layer** mapping 30+ CF-format tag names to a
  canonical vocabulary, then to LC GraphQL slugs and CSES problem tags, enabling
  cross-platform problem search across 3 sources

- **Used LangGraph SqliteSaver checkpointing** to cache scraped profiles across
  sessions (eliminating redundant API calls) and to enable HITL state persistence
  across Streamlit rerenders

- **Applied pandas for competitive programming analytics**: tag-level failure rate
  via `groupby().agg()`, peak solving hour from Unix timestamp decomposition,
  LC consistency score from submission calendar date filtering

---

*Generated by CP-Agent · Architecture version 2.0*