"""
agents/scraper_agent.py
------------------------
LangGraph node that fetches all data from Codeforces and LeetCode
concurrently using asyncio.gather(). Stores results into AgentState.

How checkpointing works here:
- On first run: cf_data and lc_data are None → fetch from APIs
- On subsequent runs with same thread_id: LangGraph restores the full
  checkpoint state before calling this node, so cf_data/lc_data are
  already populated → we skip re-fetching.
- User can force refresh by passing a new thread_id or --no-cache flag.

Sync/async note:
- The node itself is now a synchronous function so it works safely when
  called from both sync graph.stream() and async graph.astream().
- Internal async fetches use _run_async(), which checks for an already-
  running event loop and uses a ThreadPoolExecutor when one is found
  (avoids "This event loop is already running" in Streamlit / LangGraph).
"""

"""
agents/scraper_agent.py
------------------------
Two LangGraph nodes:

  scraper_node      — fetches primary user's CF + LC data into cf_data / lc_data
  peer_scraper_node — fetches peer's CF + LC data into cf_data2 / lc_data2

Both use the same async fetch helpers and the same loop-safe _run_async()
pattern so they work correctly under Streamlit and LangGraph's event loops.
"""

import asyncio
from concurrent.futures import ThreadPoolExecutor
from graph.state import AgentState
from tools.codeforces_tools import fetch_all_cf_data
from tools.leetcode_tools   import fetch_all_lc_data


# ── loop-safe async runner ────────────────────────────────────────────────────

def _run_async(coro):
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if loop is None:
        return asyncio.run(coro)
    with ThreadPoolExecutor(max_workers=1) as pool:
        return pool.submit(asyncio.run, coro).result()


# ── shared async fetch ────────────────────────────────────────────────────────

async def _fetch_pair(cf_username: str, lc_username: str,
                      existing_cf, existing_lc) -> tuple:
    """Fetch CF + LC data concurrently, reusing cached values."""

    async def run_cf():
        if existing_cf and existing_cf.get("handle"):
            return existing_cf
        if not cf_username:
            return _empty_cf(cf_username)
        return await fetch_all_cf_data(cf_username)

    async def run_lc():
        if existing_lc and existing_lc.get("username"):
            return existing_lc
        if not lc_username:
            return _empty_lc(lc_username)
        return await fetch_all_lc_data(lc_username)

    return await asyncio.gather(run_cf(), run_lc(), return_exceptions=True)


def _do_scrape(cf_username: str, lc_username: str,
               existing_cf, existing_lc, label: str) -> tuple[dict, dict, list]:
    """
    Run the async fetch, handle errors, collect inner error messages.
    Returns (cf_result, lc_result, errors_list).
    """
    errors = []
    cf_result, lc_result = _run_async(
        _fetch_pair(cf_username, lc_username, existing_cf, existing_lc)
    )

    if isinstance(cf_result, Exception):
        errors.append(f"[{label}/CF] Fetch crashed: {cf_result}")
        cf_result = _empty_cf(cf_username)
    if isinstance(lc_result, Exception):
        errors.append(f"[{label}/LC] Fetch crashed: {lc_result}")
        lc_result = _empty_lc(lc_username)

    for tag, res in [("CF", cf_result), ("LC", lc_result)]:
        for e in (res.pop("fetch_errors", []) if isinstance(res, dict) else []):
            if e:
                errors.append(f"[{label}/{tag}] {e}")

    if isinstance(cf_result, dict) and cf_result.get("handle"):
        print(f"[{label}] CF → handle={cf_result['handle']!r}, "
              f"rating={cf_result.get('rating', 0)}, "
              f"solved={cf_result.get('solved_count', 0)}")
    if isinstance(lc_result, dict) and lc_result.get("username"):
        print(f"[{label}] LC → username={lc_result['username']!r}, "
              f"solved={lc_result.get('total_solved', 0)}, "
              f"contest_rating={lc_result.get('contest_rating', 0):.1f}")

    return cf_result, lc_result, errors


# ── LangGraph node: primary user ──────────────────────────────────────────────

def scraper_node(state: AgentState) -> dict:
    """
    Fetch primary user's CF + LC data into state['cf_data'] / state['lc_data'],
    plus their computed stats into state['cf_stats'] / state['lc_stats'].

    Delegates to the reusable "profile subgraph" (graph/subgraphs.py) rather
    than duplicating scrape+stats logic — the same compiled subgraph is also
    used by peer_scraper_node below for the "compare" flow.
    """
    cf_username = (state.get("cf_username") or "").strip()
    lc_username = (state.get("lc_username") or "").strip()
    errors      = list(state.get("errors") or [])

    existing_cf = state.get("cf_data")
    existing_lc = state.get("lc_data")

    # Deferred import: graph.subgraphs imports FROM this module at its own
    # module-load time (for _do_scrape/_empty_cf/_empty_lc), so importing it
    # back at the top of this file would create a circular import. Importing
    # it here instead — inside the function body — is safe because by the
    # time scraper_node() actually runs, both modules are already fully
    # loaded.
    from graph.subgraphs import run_profile_pipeline

    result = run_profile_pipeline(
        cf_username, lc_username, existing_cf, existing_lc, label="Scraper"
    )
    errors.extend(result.get("errors", []))

    return {
        "cf_data":  result["cf_data"],
        "lc_data":  result["lc_data"],
        "cf_stats": result["cf_stats"],
        "lc_stats": result["lc_stats"],
        "errors":   errors,
    }


# ── LangGraph node: peer ──────────────────────────────────────────────────────

def peer_scraper_node(state: AgentState) -> dict:
    """
    Fetch peer's CF + LC data into state['cf_data2'] / state['lc_data2'],
    plus their computed stats into state['cf_stats2'] / state['lc_stats2'].
    Called only when intent == 'compare'.

    Reuses the exact same compiled profile subgraph as scraper_node — this
    is the concrete "subgraph reuse across two flows" the architecture
    review called out.
    """
    cf_username2 = (state.get("cf_username2") or "").strip()
    lc_username2 = (state.get("lc_username2") or "").strip()
    errors       = list(state.get("errors") or [])

    existing_cf2 = state.get("cf_data2")
    existing_lc2 = state.get("lc_data2")

    if not cf_username2 and not lc_username2:
        errors.append("[PeerScraper] No peer handles provided.")

    from graph.subgraphs import run_profile_pipeline

    result = run_profile_pipeline(
        cf_username2, lc_username2, existing_cf2, existing_lc2, label="PeerScraper"
    )
    errors.extend(result.get("errors", []))

    return {
        "cf_data2":  result["cf_data"],
        "lc_data2":  result["lc_data"],
        "cf_stats2": result["cf_stats"],
        "lc_stats2": result["lc_stats"],
        "errors":    errors,
    }


# ── empty fallback structures ─────────────────────────────────────────────────

def _empty_cf(handle: str) -> dict:
    return {
        "handle": handle or "unknown", "rating": 0, "max_rating": 0,
        "rank": "unrated", "max_rank": "unrated", "contribution": 0,
        "friends_of_count": 0, "contest_history": [], "submissions": [],
        "solved_count": 0,
    }


def _empty_lc(username: str) -> dict:
    return {
        "username": username or "unknown", "ranking": 0, "total_solved": 0,
        "easy_solved": 0, "medium_solved": 0, "hard_solved": 0,
        "contest_rating": 0.0, "contest_attended": 0,
        "contest_global_ranking": 0, "contest_top_percentage": 100.0,
        "contest_history": [], "recent_submissions": [],
        "skill_tags_advanced": [], "skill_tags_intermediate": [],
        "skill_tags_fundamental": [], "submission_calendar": {},
    }