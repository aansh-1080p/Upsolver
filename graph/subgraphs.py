"""
graph/subgraphs.py
-------------------
A small, reusable LangGraph subgraph: "profile pipeline" — scrape a single
Codeforces + LeetCode profile pair, then compute the pandas-based stats for
it (no LLM narrative here — that stays in analyzer_node/comparison_agent_node
since a narrative is only meaningful *after* combining/comparing profiles).

This subgraph is compiled ONCE at import time and reused by:
  - agents.scraper_agent.scraper_node        (primary user)
  - agents.scraper_agent.peer_scraper_node   (peer, for the "compare" flow)

Previously, scraper_node and peer_scraper_node duplicated the same
scrape-then-analyze logic. This module gives both a single, tested pipeline
to invoke instead of hand-rolling it twice, and demonstrates LangGraph
subgraph composition (a graph invoked as a node-equivalent inside a bigger
graph) rather than a flat sequence of nodes.

Design note: the subgraph uses its own small, generic state schema
(ProfileState) rather than the parent AgentState, because the parent state
uses differently-suffixed field names for primary vs. peer data
(cf_data / cf_data2). Callers translate between the parent's field names and
this generic schema before/after invoking the subgraph — the standard
pattern for reusing a subgraph whose state shape doesn't line up 1:1 with
every call site.
"""

from typing import Optional, TypedDict

from langgraph.graph import StateGraph, START, END

# Reusing the already-tested fetch + stats helpers rather than duplicating
# them. This creates a one-directional dependency (graph -> agents), which
# is safe: agents.scraper_agent and agents.analyzer_agent do NOT import
# graph.subgraphs at module load time (see the deferred imports inside
# scraper_node / peer_scraper_node in agents/scraper_agent.py), so there is
# no circular import.
from agents.scraper_agent import _do_scrape, _empty_cf, _empty_lc
from agents.analyzer_agent import _analyze_cf, _analyze_lc


class ProfileState(TypedDict):
    cf_username: str
    lc_username: str
    cf_data: Optional[dict]
    lc_data: Optional[dict]
    cf_stats: Optional[dict]
    lc_stats: Optional[dict]
    errors: list
    label: str


def _scrape_step(state: ProfileState) -> dict:
    cf_username = (state.get("cf_username") or "").strip()
    lc_username = (state.get("lc_username") or "").strip()
    label       = state.get("label") or "Profile"
    errors      = list(state.get("errors") or [])

    existing_cf = state.get("cf_data")
    existing_lc = state.get("lc_data")

    cf_cached = bool(existing_cf and existing_cf.get("handle"))
    lc_cached = bool(existing_lc and existing_lc.get("username"))

    if cf_cached and lc_cached:
        print(f"[ProfileSubgraph/{label}] Both CF+LC cached — skipping re-fetch.")
        return {"cf_data": existing_cf, "lc_data": existing_lc, "errors": errors}

    print(f"[ProfileSubgraph/{label}] Fetching — CF='{cf_username}', LC='{lc_username}'")
    cf_result, lc_result, new_errors = _do_scrape(
        cf_username, lc_username, existing_cf, existing_lc, label
    )
    errors.extend(new_errors)
    return {"cf_data": cf_result, "lc_data": lc_result, "errors": errors}


def _stats_step(state: ProfileState) -> dict:
    cf_data = state.get("cf_data") or {}
    lc_data = state.get("lc_data") or {}
    return {
        "cf_stats": _analyze_cf(cf_data),
        "lc_stats": _analyze_lc(lc_data),
    }


def build_profile_subgraph():
    builder = StateGraph(ProfileState)
    builder.add_node("scrape", _scrape_step)
    builder.add_node("compute_stats", _stats_step)
    builder.add_edge(START, "scrape")
    builder.add_edge("scrape", "compute_stats")
    builder.add_edge("compute_stats", END)
    return builder.compile()


# Compiled once; every call to run_profile_pipeline() below reuses this same
# compiled graph object (this IS the "reuse", not a stylistic wrapper).
PROFILE_SUBGRAPH = build_profile_subgraph()


def run_profile_pipeline(
    cf_username: str,
    lc_username: str,
    existing_cf: Optional[dict],
    existing_lc: Optional[dict],
    label: str = "Profile",
) -> dict:
    """
    Invoke the compiled profile subgraph synchronously.

    Returns a dict with keys: cf_data, lc_data, cf_stats, lc_stats, errors.

    This never raises: on any unexpected failure it falls back to empty (but
    valid, correctly-shaped) CF/LC structures and their corresponding stats,
    so scraper_node / peer_scraper_node never have to special-case a crash
    here — they get a well-formed result either way.
    """
    try:
        result = PROFILE_SUBGRAPH.invoke({
            "cf_username": cf_username,
            "lc_username": lc_username,
            "cf_data":     existing_cf,
            "lc_data":     existing_lc,
            "cf_stats":    None,
            "lc_stats":    None,
            "errors":      [],
            "label":       label,
        })
        # Defensive: guarantee every expected key is present even if a
        # future edit to the subgraph accidentally narrows its output.
        return {
            "cf_data":  result.get("cf_data")  or _empty_cf(cf_username),
            "lc_data":  result.get("lc_data")  or _empty_lc(lc_username),
            "cf_stats": result.get("cf_stats") or _analyze_cf(result.get("cf_data") or {}),
            "lc_stats": result.get("lc_stats") or _analyze_lc(result.get("lc_data") or {}),
            "errors":   result.get("errors", []),
        }
    except Exception as e:
        print(f"[ProfileSubgraph/{label}] Invocation failed: {type(e).__name__}: {e}")
        cf_data = existing_cf or _empty_cf(cf_username)
        lc_data = existing_lc or _empty_lc(lc_username)
        return {
            "cf_data":  cf_data,
            "lc_data":  lc_data,
            "cf_stats": _analyze_cf(cf_data),
            "lc_stats": _analyze_lc(lc_data),
            "errors":   [f"[{label}] Profile subgraph failed: {e}"],
        }
