"""
agents/planner_agent.py
------------------------
Study plan generator with Human-in-the-Loop.

Flow:
  1. planner_node  → calls LLM, parses JSON plan → state["plan"] status="draft"
  2. hitl_node     → interrupt() pauses the graph. Streamlit shows draft plan.
                     User approves or gives feedback.
  3. (cycle back)  → if feedback given, planner re-generates with updated prefs.

URL VALIDATION FIX:
  LLMs (including Groq models) frequently hallucinate plausible-looking URLs
  that 404. The fix is a two-layer approach:
    1. Prompt instructs the LLM to ONLY use known-safe base domains from a
       curated list (cp-algorithms.com, cses.fi, youtube.com, leetcode.com,
       neetcode.io, geeksforgeeks.org). USACO is excluded (fragile URLs).
    2. After parsing, _validate_and_fix_resources() does a real HTTP HEAD
       check on every URL. Any URL that fails (404, timeout, error) is
       replaced with a guaranteed-working fallback from _TOPIC_RESOURCES —
       a hand-curated map of topic → verified working links.
"""

import asyncio
import httpx
from concurrent.futures import ThreadPoolExecutor

from langgraph.types import interrupt
from graph.state     import AgentState


# ── Curated fallback resources (all manually verified) ────────────────────────
# Used when LLM-generated URLs fail validation.
# Key = lowercase topic keyword; value = list of {name, url} dicts.

_TOPIC_RESOURCES: dict[str, list[dict]] = {
    "dynamic programming": [
        {"name": "DP on CP-Algorithms",      "url": "https://cp-algorithms.com/dynamic_programming/intro-to-dp.html"},
        {"name": "CSES DP Problems",          "url": "https://cses.fi/problemset/list/"},
        {"name": "LeetCode DP Study Plan",    "url": "https://leetcode.com/studyplan/dynamic-programming/"},
    ],
    "dp": [
        {"name": "DP on CP-Algorithms",      "url": "https://cp-algorithms.com/dynamic_programming/intro-to-dp.html"},
        {"name": "CSES DP Problems",          "url": "https://cses.fi/problemset/list/"},
        {"name": "LeetCode DP Study Plan",    "url": "https://leetcode.com/studyplan/dynamic-programming/"},
    ],
    "graphs": [
        {"name": "Graph Theory CP-Algorithms","url": "https://cp-algorithms.com/graph/bfs.html"},
        {"name": "CSES Graph Problems",       "url": "https://cses.fi/problemset/list/"},
        {"name": "NeetCode Graphs",           "url": "https://neetcode.io/roadmap"},
    ],
    "graph": [
        {"name": "Graph Theory CP-Algorithms","url": "https://cp-algorithms.com/graph/bfs.html"},
        {"name": "CSES Graph Problems",       "url": "https://cses.fi/problemset/list/"},
        {"name": "NeetCode Graphs",           "url": "https://neetcode.io/roadmap"},
    ],
    "trees": [
        {"name": "Trees on CP-Algorithms",   "url": "https://cp-algorithms.com/graph/lca.html"},
        {"name": "CSES Tree Problems",        "url": "https://cses.fi/problemset/list/"},
        {"name": "NeetCode Trees",            "url": "https://neetcode.io/roadmap"},
    ],
    "binary search": [
        {"name": "Binary Search CP-Algorithms","url": "https://cp-algorithms.com/num_methods/binary_search.html"},
        {"name": "CSES Sorting & Searching",  "url": "https://cses.fi/problemset/list/"},
        {"name": "LeetCode Binary Search",    "url": "https://leetcode.com/tag/binary-search/"},
    ],
    "greedy": [
        {"name": "Greedy CP-Algorithms",      "url": "https://cp-algorithms.com/greedy/"},
        {"name": "CSES Sorting & Searching",  "url": "https://cses.fi/problemset/list/"},
        {"name": "LeetCode Greedy",           "url": "https://leetcode.com/tag/greedy/"},
    ],
    "segment tree": [
        {"name": "Segment Tree CP-Algorithms","url": "https://cp-algorithms.com/data_structures/segment_tree.html"},
        {"name": "CSES Range Queries",        "url": "https://cses.fi/problemset/list/"},
    ],
    "number theory": [
        {"name": "Number Theory CP-Algorithms","url": "https://cp-algorithms.com/algebra/sieve-of-eratosthenes.html"},
        {"name": "CSES Math Problems",        "url": "https://cses.fi/problemset/list/"},
    ],
    "strings": [
        {"name": "String Algorithms CP-Alg", "url": "https://cp-algorithms.com/string/string-hashing.html"},
        {"name": "CSES String Problems",      "url": "https://cses.fi/problemset/list/"},
        {"name": "LeetCode Strings",          "url": "https://leetcode.com/tag/string/"},
    ],
    "math": [
        {"name": "Math on CP-Algorithms",    "url": "https://cp-algorithms.com/algebra/"},
        {"name": "CSES Math Problems",        "url": "https://cses.fi/problemset/list/"},
    ],
    "sorting": [
        {"name": "Sorting CP-Algorithms",    "url": "https://cp-algorithms.com/sequences/longest_increasing_subsequence.html"},
        {"name": "CSES Sorting & Searching", "url": "https://cses.fi/problemset/list/"},
        {"name": "LeetCode Sorting",         "url": "https://leetcode.com/tag/sorting/"},
    ],
    "two pointers": [
        {"name": "Two Pointers Technique",   "url": "https://cp-algorithms.com/sequences/"},
        {"name": "LeetCode Two Pointers",    "url": "https://leetcode.com/tag/two-pointers/"},
        {"name": "NeetCode Two Pointers",    "url": "https://neetcode.io/roadmap"},
    ],
    "hashing": [
        {"name": "String Hashing CP-Alg",   "url": "https://cp-algorithms.com/string/string-hashing.html"},
        {"name": "LeetCode Hash Table",      "url": "https://leetcode.com/tag/hash-table/"},
    ],
    "bit manipulation": [
        {"name": "Bit Tricks CP-Algorithms", "url": "https://cp-algorithms.com/algebra/bit-manipulation.html"},
        {"name": "LeetCode Bit Manipulation","url": "https://leetcode.com/tag/bit-manipulation/"},
    ],
    "union find": [
        {"name": "DSU CP-Algorithms",        "url": "https://cp-algorithms.com/data_structures/disjoint_set_union.html"},
        {"name": "CSES Graph Problems",      "url": "https://cses.fi/problemset/list/"},
    ],
    "shortest path": [
        {"name": "Dijkstra CP-Algorithms",   "url": "https://cp-algorithms.com/graph/dijkstra.html"},
        {"name": "CSES Shortest Paths",      "url": "https://cses.fi/problemset/list/"},
    ],
    "backtracking": [
        {"name": "Backtracking LeetCode",    "url": "https://leetcode.com/tag/backtracking/"},
        {"name": "NeetCode Backtracking",    "url": "https://neetcode.io/roadmap"},
    ],
    "heap": [
        {"name": "Heap LeetCode",            "url": "https://leetcode.com/tag/heap-priority-queue/"},
        {"name": "NeetCode Heap",            "url": "https://neetcode.io/roadmap"},
    ],
    "trie": [
        {"name": "Trie CP-Algorithms",       "url": "https://cp-algorithms.com/string/aho_corasick.html"},
        {"name": "LeetCode Trie",            "url": "https://leetcode.com/tag/trie/"},
    ],
    # default fallback for unknown topics
    "_default": [
        {"name": "CP-Algorithms",            "url": "https://cp-algorithms.com"},
        {"name": "CSES Problemset",          "url": "https://cses.fi/problemset/list/"},
        {"name": "LeetCode Explore",         "url": "https://leetcode.com/explore/"},
    ],
}


def _get_fallback_resources(topic: str) -> list[dict]:
    """Return curated resources for a topic, falling back to defaults."""
    t = topic.lower()
    for key in _TOPIC_RESOURCES:
        if key != "_default" and key in t:
            return _TOPIC_RESOURCES[key]
    return _TOPIC_RESOURCES["_default"]


# ── URL validator ─────────────────────────────────────────────────────────────

_VALIDATE_TIMEOUT = httpx.Timeout(8.0, connect=5.0)
_VALIDATE_HEADERS = {"User-Agent": "Mozilla/5.0 (compatible; cp-agent-url-checker/1.0)"}


async def _check_url(client: httpx.AsyncClient, url: str) -> bool:
    """Return True if URL responds with a non-404/non-error status."""
    try:
        # Try HEAD first (fast), fall back to GET for servers that block HEAD
        r = await client.head(url, headers=_VALIDATE_HEADERS, timeout=_VALIDATE_TIMEOUT,
                              follow_redirects=True)
        if r.status_code == 405:   # Method Not Allowed — try GET
            r = await client.get(url, headers=_VALIDATE_HEADERS, timeout=_VALIDATE_TIMEOUT,
                                 follow_redirects=True)
        return r.status_code < 400
    except Exception:
        return False


async def _validate_weeks(weeks: list[dict]) -> list[dict]:
    """
    For every resource URL in all weeks, check reachability.
    Replace broken URLs with curated fallbacks for that week's topic.
    """
    # Collect all (week_idx, res_idx, url) triples
    checks: list[tuple[int, int, str]] = []
    for wi, week in enumerate(weeks):
        for ri, res in enumerate(week.get("resources", [])):
            url = res.get("url", "")
            if url:
                checks.append((wi, ri, url))

    if not checks:
        return weeks

    print(f"[Planner] Validating {len(checks)} resource URLs...")

    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            *[_check_url(client, url) for _, _, url in checks],
            return_exceptions=True,
        )

    # Map (wi, ri) → ok/fail
    status: dict[tuple[int, int], bool] = {}
    for (wi, ri, url), ok in zip(checks, results):
        is_ok = ok is True   # exceptions count as False
        status[(wi, ri)] = is_ok
        if not is_ok:
            print(f"[Planner] ✗ broken URL (week {wi+1}): {url}")
        else:
            print(f"[Planner] ✓ ok (week {wi+1}): {url}")

    # Fix broken resources
    fixed_weeks = []
    for wi, week in enumerate(weeks):
        resources = week.get("resources", [])
        topic     = week.get("topic", "")
        new_res   = []
        for ri, res in enumerate(resources):
            if status.get((wi, ri), True):   # ok or not checked
                new_res.append(res)
            # broken → skip (we'll top-up below)

        # If we lost resources, top up from curated list
        if len(new_res) < 2:
            fallbacks = _get_fallback_resources(topic)
            existing_urls = {r["url"] for r in new_res}
            for fb in fallbacks:
                if fb["url"] not in existing_urls and len(new_res) < 3:
                    new_res.append(fb)

        fixed_weeks.append({**week, "resources": new_res})

    return fixed_weeks


def _run_async(coro):
    """Run async coroutine safely whether or not an event loop is already running."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop is None:
        return asyncio.run(coro)

    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


# ── prompt ────────────────────────────────────────────────────────────────────

def _build_plan_prompt(analysis: dict, user_prefs: dict) -> str:
    weak_topics = analysis.get("weak_topics", [])
    weak_str = ", ".join(
        f"{t['tag']} ({t['platform']})"
        for t in weak_topics[:6]
    ) or "general improvement"

    strong_str = ", ".join(
        t["tag"] for t in analysis.get("strong_topics", [])[:4]
    ) or "none identified"

    cf_rating = analysis.get("_cf", {}).get("cf_rating", 0)
    goal      = user_prefs.get("goal", "improve competitive programming skills")
    hours     = user_prefs.get("hours_per_day", 2)
    weeks     = user_prefs.get("duration_weeks", 4)

    safe_goal = goal.replace('"', '\\"')
    return f"""You are a competitive programming coach. Create a {weeks}-week study plan.

Programmer profile:
- Current CF rating: {cf_rating}
- Goal: {goal}
- Available: {hours} hours/day
- Weak topics to focus on: {weak_str}
- Strong topics (skip basics): {strong_str}

YOU MUST respond with ONLY a valid JSON object. No explanation. No markdown.
Start your response directly with {{ and end with }}.

Required structure:
{{
  "goal": "{safe_goal}",
  "weeks": [
    {{
      "week": 1,
      "topic": "Main topic name",
      "subtopics": ["subtopic 1", "subtopic 2", "subtopic 3"],
      "resources": [
        {{"name": "Resource name", "url": "https://cp-algorithms.com"}}
      ],
      "problems_per_day": 3
    }}
  ]
}}

STRICT URL RULES — violations will break the app:
- ONLY use URLs from these exact base domains: cp-algorithms.com, cses.fi, leetcode.com, neetcode.io, geeksforgeeks.org
- For cp-algorithms.com: ONLY use "https://cp-algorithms.com" (homepage) or "https://cp-algorithms.com/algebra/" or "https://cp-algorithms.com/graph/" or "https://cp-algorithms.com/data_structures/" or "https://cp-algorithms.com/string/" or "https://cp-algorithms.com/dynamic_programming/intro-to-dp.html" — do NOT invent article slugs.
- For cses.fi: ONLY use "https://cses.fi/problemset/list/" — nothing else.
- For leetcode.com: ONLY use "https://leetcode.com/tag/<tag>/" or "https://leetcode.com/studyplan/dynamic-programming/" or "https://leetcode.com/explore/"
- For neetcode.io: ONLY use "https://neetcode.io/roadmap"
- Do NOT use USACO, do NOT use YouTube, do NOT invent URLs.
- Exactly {weeks} week entries in the array.
- Each week: 1 main topic, 3 subtopics, 2-3 resources.
- First weeks must address the weakest topics listed above.
- problems_per_day must be an integer between 2 and 5.
- Output ONLY the JSON object. Nothing before {{. Nothing after }}.
"""


# ── LLM call with robust parsing ──────────────────────────────────────────────

def _call_llm_for_plan(prompt: str) -> list[dict]:
    from agents.llm_utils import call_llm, parse_json_from_llm
    from langchain_core.messages import HumanMessage as HM

    raw = call_llm([HM(content=prompt)], temperature=0.3)
    if not raw:
        return []

    parsed = parse_json_from_llm(raw, label="Planner")
    if parsed is None:
        return []

    if isinstance(parsed, dict):
        weeks = parsed.get("weeks", [])
    elif isinstance(parsed, list):
        weeks = parsed
    else:
        print(f"[Planner] Unexpected parsed type: {type(parsed)}")
        return []

    if not weeks:
        print("[Planner] Parsed JSON but 'weeks' array is empty.")
        return []

    print(f"[Planner] Successfully parsed {len(weeks)} weeks.")
    return weeks


# ── fallback plan ─────────────────────────────────────────────────────────────

def _fallback_plan(user_prefs: dict, weak_topics: list) -> list[dict]:
    """Hardcoded fallback when the LLM fails. All URLs are verified working."""
    duration    = user_prefs.get("duration_weeks", 4)
    topic_names = [t["tag"] for t in weak_topics[:duration]]

    defaults = [
        "Dynamic Programming", "Graph Algorithms",
        "Trees and Binary Search", "Mathematics and Number Theory",
        "Strings and Hashing", "Segment Trees and BIT",
    ]
    while len(topic_names) < duration:
        for d in defaults:
            if d not in topic_names:
                topic_names.append(d)
            if len(topic_names) >= duration:
                break

    weeks = []
    for i in range(duration):
        topic = topic_names[i] if i < len(topic_names) else f"Advanced Topic {i+1}"
        weeks.append({
            "week":             i + 1,
            "topic":            topic,
            "subtopics":        ["Core theory", "Basic problems", "Contest-level problems"],
            "resources":        _get_fallback_resources(topic),
            "problems_per_day": 3,
        })
    return weeks


# ── LangGraph nodes ───────────────────────────────────────────────────────────

def planner_node(state: AgentState) -> dict:
    analysis   = state.get("analysis") or {}
    user_prefs = state.get("user_prefs") or {}
    errors     = list(state.get("errors") or [])
    existing   = state.get("plan") or {}

    if existing.get("status") == "approved":
        print("[Planner] Plan already approved — skipping.")
        return {"plan": existing, "errors": errors}

    feedback = existing.get("user_feedback", "").strip()
    if feedback:
        print(f"[Planner] Applying HITL feedback: {feedback[:80]!r}")
        base_goal  = user_prefs.get("goal", "")
        user_prefs = {**user_prefs, "goal": f"{base_goal}. Revision: {feedback}"}

    if not user_prefs.get("goal"):
        cf_rating  = analysis.get("_cf", {}).get("cf_rating", 0)
        user_prefs = {
            "goal":                f"Improve from CF rating {cf_rating}",
            "hours_per_day":       2,
            "duration_weeks":      4,
            "preferred_resources": [],
            "target_rating":       None,
        }

    n_weeks = user_prefs.get("duration_weeks", 4)
    print(f"[Planner] Generating {n_weeks}-week plan...")

    prompt = _build_plan_prompt(analysis, user_prefs)
    weeks  = _call_llm_for_plan(prompt)

    if not weeks:
        print("[Planner] LLM failed — using fallback plan.")
        errors.append("[Planner] Fallback plan used. Check your API key in .env.")
        weeks = _fallback_plan(user_prefs, analysis.get("weak_topics", []))
    else:
        # Validate and fix all URLs before showing to user
        print("[Planner] Running URL validation...")
        weeks = _run_async(_validate_weeks(weeks))
        print("[Planner] URL validation complete.")

    plan = {
        "status":        "draft",
        "goal":          user_prefs.get("goal", ""),
        "weeks":         weeks,
        "user_feedback": "",
    }

    print(f"[Planner] Draft plan ready — {len(weeks)} weeks.")
    return {"plan": plan, "errors": errors, "user_prefs": user_prefs}


def hitl_node(state: AgentState) -> dict:
    plan = state.get("plan") or {}

    if plan.get("status") == "approved":
        print("[HITL] Plan already approved — passing through.")
        return {}

    user_feedback = interrupt({
        "message": "Review your study plan. Approve or request changes.",
        "plan":    plan,
    })

    if isinstance(user_feedback, dict):
        action   = user_feedback.get("action", "approve")
        feedback = user_feedback.get("feedback", "")
    else:
        text     = str(user_feedback).strip().lower()
        action   = "approve" if text in ("approve", "ok", "yes", "looks good", "") else "revise"
        feedback = str(user_feedback).strip() if action == "revise" else ""

    if action == "approve":
        print("[HITL] User approved.")
        return {"plan": {**plan, "status": "approved", "user_feedback": ""}}

    print(f"[HITL] Revision requested: {feedback[:80]!r}")
    return {"plan": {**plan, "status": "draft", "user_feedback": feedback}}