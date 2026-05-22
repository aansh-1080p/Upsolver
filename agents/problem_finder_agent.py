"""
agents/problem_finder_agent.py
-------------------------------
LangGraph node — finds unsolved practice problems across CF, CSES, LC.

Flow:
  1. Extract weak tag names from state["analysis"]["weak_topics"]
  2. Normalize tags from CF-format → canonical (fixes "dfs and similar" → "graphs")
  3. Fetch CF problems using original CF-format tags (CF API understands them)
  4. Fetch CSES problems using canonical tags (CSES list is tagged canonically)
  5. Fetch LC problems using canonical tags → LC slugs (fixes the slug mismatch)
  6. Filter out already-solved problems
  7. Score and rank by relevance to weak topics
  8. Return top 30 into state["problems"]
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor

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
        _fetch_all(cf_tags, canonical_tags, difficulty)
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