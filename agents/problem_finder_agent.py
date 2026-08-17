"""
agents/problem_finder_agent.py
-------------------------------
LangGraph node — finds unsolved practice problems across CF, CSES, LC.

Flow:
  1. Extract weak tag names from state["analysis"]["weak_topics"]
  2. Normalize tags from CF-format → canonical (fixes "dfs and similar" → "graphs")
  3. An LLM agent, bound to three tools (search_codeforces / search_cses /
     search_leetcode), DECIDES which source(s) are worth querying for these
     weak topics/difficulty and calls them itself — rather than this node
     unconditionally fetching all three every time. This is the "agentic"
     version of problem sourcing: the model reasons about tool use instead
     of following a hardcoded fetch-everything sequence.
  4. Filter out already-solved problems
  5. Score and rank by relevance to weak topics
  6. Return top 30 into state["problems"]

Reliability note: if tool-calling isn't supported by the configured
model/provider, or the agent declines to call anything, or every tool call
it makes fails, this falls back to the original deterministic "fetch all
three sources" behaviour (_fetch_all) — so the feature is strictly
additive and can never leave the user with fewer results than before.
"""

import asyncio
import json
from concurrent.futures import ThreadPoolExecutor

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.tools import tool

from graph.state import AgentState
from tools.search_tools import (
    fetch_cf_problems,
    fetch_cses_problems,
    fetch_lc_problems,
    _normalize_tags,
)


def _get_weak_tags(analysis: dict) -> list[str]:
    return [t.get("tag", "") for t in analysis.get("weak_topics", []) if t.get("tag")]


def _build_solved_set(cf_data: dict, lc_data: dict) -> set[str]:
    solved = set()
    for sub in cf_data.get("submissions", []):
        if sub.get("verdict") == "OK":
            name = sub.get("problem_name", "").strip().lower()
            if name:
                solved.add(name)
    for sub in lc_data.get("recent_submissions", []):
        status = sub.get("statusDisplay", "") or sub.get("status_display", "")
        if status == "Accepted":
            slug  = sub.get("titleSlug", "") or sub.get("title_slug", "")
            title = sub.get("title", "")
            if slug:
                solved.add(slug.lower())
            if title:
                solved.add(title.strip().lower())
    return solved


def _is_solved(problem: dict, solved_set: set[str]) -> bool:
    title = problem.get("title", "").strip().lower()
    pid   = problem.get("_id", "").strip().lower()
    return title in solved_set or pid in solved_set


def _score(problem: dict, canonical_tags: list[str]) -> int:
    p_tags = {t.lower() for t in problem.get("tags", [])}
    w_tags = set(canonical_tags)
    return len(p_tags & w_tags)


def _cf_rating_range(difficulty: str) -> tuple[int, int]:
    d = difficulty.lower()
    if d == "easy":   return (800,  1400)
    if d == "hard":   return (1800, 3500)
    return (1200, 1800)


async def _fetch_all(cf_tags: list[str], canonical_tags: list[str], difficulty: str):
    """Fetch from all three sources concurrently."""
    min_r, max_r = _cf_rating_range(difficulty)

    cf_task   = fetch_cf_problems(cf_tags, min_rating=min_r, max_rating=max_r)
    lc_task   = fetch_lc_problems(canonical_tags, difficulty=difficulty, limit=25)

    async def _cses():
        return fetch_cses_problems(canonical_tags)

    cf_res, cses_res, lc_res = await asyncio.gather(
        cf_task, _cses(), lc_task,
        return_exceptions=True,
    )
    return (
        cf_res   if isinstance(cf_res,   list) else [],
        cses_res if isinstance(cses_res, list) else [],
        lc_res   if isinstance(lc_res,   list) else [],
    )


def _run_async(coro):
    """Run async coroutine safely whether or not an event loop is running."""
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop is None:
        return asyncio.run(coro)

    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


# ── tool-calling agent for source selection ───────────────────────────────────
#
# Each fetch function is wrapped as a LangChain tool. An LLM bound to these
# tools decides which source(s) to query and with what tags, instead of the
# node unconditionally calling all three every time. Tools return a JSON
# string (the standard, simplest ToolMessage-compatible shape) which the
# orchestration function below parses back into problem-object lists.

@tool
async def search_codeforces(tags: list[str], difficulty: str = "medium") -> str:
    """
    Search Codeforces' problemset for practice problems matching the given
    tags (Codeforces-native tag names, e.g. "dp", "dfs and similar", "graphs")
    and difficulty ("easy", "medium", or "hard"). Returns a JSON array of
    problem objects (title, url, platform, difficulty/rating, tags).
    """
    min_r, max_r = _cf_rating_range(difficulty)
    try:
        results = await fetch_cf_problems(tags, min_rating=min_r, max_rating=max_r)
    except Exception as e:
        print(f"[ProblemFinder/tool] search_codeforces failed: {e}")
        results = []
    return json.dumps(results if isinstance(results, list) else [])


@tool
def search_cses(canonical_tags: list[str]) -> str:
    """
    Search the curated CSES problem set for practice problems matching the
    given canonical/generic tags (e.g. "dp", "graphs", "binary search" — NOT
    Codeforces-specific tag names). Returns a JSON array of problem objects.
    """
    try:
        results = fetch_cses_problems(canonical_tags)
    except Exception as e:
        print(f"[ProblemFinder/tool] search_cses failed: {e}")
        results = []
    return json.dumps(results if isinstance(results, list) else [])


@tool
async def search_leetcode(canonical_tags: list[str], difficulty: str = "medium") -> str:
    """
    Search LeetCode for practice problems matching the given canonical/
    generic tags (e.g. "dp", "graphs", "binary search") and difficulty
    ("easy", "medium", or "hard"). Returns a JSON array of problem objects.
    """
    try:
        results = await fetch_lc_problems(canonical_tags, difficulty=difficulty, limit=25)
    except Exception as e:
        print(f"[ProblemFinder/tool] search_leetcode failed: {e}")
        results = []
    return json.dumps(results if isinstance(results, list) else [])


_PROBLEM_TOOLS = [search_codeforces, search_cses, search_leetcode]


async def _agent_choose_and_fetch(cf_tags: list[str], canonical_tags: list[str], difficulty: str):
    """
    Ask an LLM which problem source(s) to query — and with what tags — then
    execute exactly the tool calls it requests. Falls back to the original
    deterministic "query all three sources" behaviour (_fetch_all) if:
      - tool-calling / bind_tools isn't supported by the configured model,
      - the model makes no tool calls at all, or
      - every tool call it did make came back empty.
    This guarantees the agentic path can never leave the user with an empty
    results screen just because a single LLM decision (or tool call) failed.
    """
    from agents.llm_utils import get_llm

    try:
        llm = get_llm(temperature=0.0)
        llm_with_tools = llm.bind_tools(_PROBLEM_TOOLS)
    except Exception as e:
        print(f"[ProblemFinder] Tool-binding unavailable ({type(e).__name__}: {e}) — "
              f"using deterministic fetch-all.")
        return await _fetch_all(cf_tags, canonical_tags, difficulty)

    system = SystemMessage(content=(
        "You are a practice-problem sourcing agent for a competitive programmer. "
        "You have three tools: search_codeforces (call it with Codeforces-native "
        "tag names), search_cses and search_leetcode (call these with canonical/"
        "generic tag names). Decide which tool(s) are worth calling given the "
        "user's weak topics and difficulty, and call each with a non-empty, "
        "relevant tag list. Prefer calling all three unless a source is clearly "
        "unhelpful for these specific topics. Respond ONLY with tool calls — no "
        "prose."
    ))
    human = HumanMessage(content=(
        f"Weak topics (Codeforces-format tags): {cf_tags}\n"
        f"Weak topics (canonical tags): {canonical_tags}\n"
        f"Difficulty: {difficulty}\n"
        "Call the appropriate tool(s) now."
    ))

    try:
        ai_msg = await llm_with_tools.ainvoke([system, human])
    except Exception as e:
        print(f"[ProblemFinder] Tool-selection call failed ({type(e).__name__}: {e}) — "
              f"using deterministic fetch-all.")
        return await _fetch_all(cf_tags, canonical_tags, difficulty)

    tool_calls = getattr(ai_msg, "tool_calls", None) or []
    if not tool_calls:
        print("[ProblemFinder] Agent made no tool calls — using deterministic fetch-all.")
        return await _fetch_all(cf_tags, canonical_tags, difficulty)

    tool_map = {t.name: t for t in _PROBLEM_TOOLS}
    cf_probs, cses_probs, lc_probs = [], [], []

    for call in tool_calls:
        name = call.get("name")
        args = call.get("args", {}) or {}
        chosen_tool = tool_map.get(name)
        if chosen_tool is None:
            print(f"[ProblemFinder] Agent requested unknown tool {name!r} — skipping.")
            continue

        try:
            raw = await chosen_tool.ainvoke(args)
            parsed = json.loads(raw) if isinstance(raw, str) else raw
            if not isinstance(parsed, list):
                parsed = []
        except Exception as e:
            print(f"[ProblemFinder] Tool call '{name}' failed: {type(e).__name__}: {e}")
            parsed = []

        if name == "search_codeforces":
            cf_probs.extend(parsed)
        elif name == "search_cses":
            cses_probs.extend(parsed)
        elif name == "search_leetcode":
            lc_probs.extend(parsed)

    called_names = {c.get("name") for c in tool_calls}
    print(f"[ProblemFinder] Agent chose sources: {sorted(called_names)} — "
          f"CF:{len(cf_probs)} CSES:{len(cses_probs)} LC:{len(lc_probs)}")

    if not (cf_probs or cses_probs or lc_probs):
        print("[ProblemFinder] Agent-selected fetch returned nothing — "
              "falling back to deterministic fetch-all as a safety net.")
        return await _fetch_all(cf_tags, canonical_tags, difficulty)

    return cf_probs, cses_probs, lc_probs


def problem_finder_node(state: AgentState) -> dict:
    """LangGraph node — fetch, filter, rank practice problems."""
    analysis   = state.get("analysis") or {}
    cf_data    = state.get("cf_data")  or {}
    lc_data    = state.get("lc_data")  or {}
    user_prefs = state.get("user_prefs") or {}
    errors     = list(state.get("errors") or [])

    # Raw CF-format tags (used for CF API query — it understands these natively)
    cf_tags    = _get_weak_tags(analysis)
    difficulty = user_prefs.get("problem_difficulty", "medium")

    if not cf_tags:
        errors.append("[ProblemFinder] No weak topics — returning empty list.")
        return {"problems": [], "errors": errors}

    # Canonical tags (used for CSES matching and LC slug lookup)
    canonical_tags = _normalize_tags(cf_tags)

    print(f"[ProblemFinder] CF tags:        {cf_tags[:5]}")
    print(f"[ProblemFinder] Canonical tags: {canonical_tags[:5]}")
    print(f"[ProblemFinder] Difficulty:     {difficulty}")

    cf_probs, cses_probs, lc_probs = _run_async(
        _agent_choose_and_fetch(cf_tags, canonical_tags, difficulty)
    )

    print(f"[ProblemFinder] Raw counts — CF:{len(cf_probs)} CSES:{len(cses_probs)} LC:{len(lc_probs)}")

    solved_set  = _build_solved_set(cf_data, lc_data)
    all_probs   = cf_probs + cses_probs + lc_probs

    unsolved = []
    for p in all_probs:
        if not _is_solved(p, solved_set):
            p["relevance"] = _score(p, canonical_tags)
            unsolved.append(p)

    unsolved.sort(key=lambda p: (-p["relevance"], p.get("rating", 0)))

    final = []
    for p in unsolved[:30]:
        p.pop("_id", None)
        final.append(p)

    print(f"[ProblemFinder] Final: {len(final)} problems "
          f"(CF:{sum(1 for p in final if p['platform']=='codeforces')} "
          f"CSES:{sum(1 for p in final if p['platform']=='cses')} "
          f"LC:{sum(1 for p in final if p['platform']=='leetcode')})")

    return {"problems": final, "errors": errors}