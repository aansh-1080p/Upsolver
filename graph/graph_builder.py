"""
graph/graph_builder.py
-----------------------
Upsolvers — complete graph including peer comparison.

Flows by intent:

  report   → supervisor → scraper → scrape_guard → analyzer → report_generator → END
  plan     → supervisor → scraper → scrape_guard → analyzer → planner → hitl → [END | planner cycle]
  problems → supervisor → scraper → scrape_guard → analyzer → problem_finder → END
  all      → supervisor → scraper → scrape_guard → analyzer → report_generator → planner → hitl → END
  compare  → supervisor → scraper → scrape_guard → peer_scraper → comparison_agent → END

Key: compare intent SKIPS the analyzer entirely — it has its own analysis
     logic inside comparison_agent_node, which reuses the cf_stats/lc_stats
     already computed by the reusable profile subgraph (graph/subgraphs.py)
     inside scraper_node/peer_scraper_node.

Dynamic routing: supervisor_node and scrape_guard_node return LangGraph
Command objects (state update + next-node choice in one step) instead of
relying purely on static/conditional edges. See their docstrings below for
what each decides at runtime, and route_after_scraper's docstring for the
rollback path if this ever needs to be reverted to purely static routing.

LangGraph features demonstrated:
  - StateGraph + TypedDict state
  - Reusable compiled subgraph (graph/subgraphs.py), invoked from two
    different node functions with differently-named parent state fields
  - Command-based dynamic routing (supervisor_node, scrape_guard_node),
    including a retry-loop back to an earlier node
  - Conditional edge functions with data-quality guards
  - planner → hitl → planner cycle (re-generation loop)
  - interrupt() inside hitl_node  (Human-in-the-loop)
  - SqliteSaver checkpointing
"""

# imports from external libraries
from langgraph.graph import StateGraph, START, END
from langgraph.types import Command

#imports from other files in the graph/ directory
from graph.state        import AgentState
from graph.checkpointer import get_checkpointer, make_thread_id

from agents.scraper_agent    import scraper_node, peer_scraper_node
from agents.analyzer_agent   import analyzer_node
from agents.comparison_agent import comparison_agent_node
from tools.report_tools      import report_generator_node
from agents.supervisor       import supervisor_node
from agents.planner_agent    import planner_node, hitl_node
from agents.problem_finder_agent import problem_finder_node


# ── routing functions ────────────────────────────────────────────────────────

# LEGACY — kept only as a documented rollback reference. This is the
# original static conditional-edge function that used to route directly
# after the scraper. It has been superseded by scrape_guard_node (below),
# which does everything this did PLUS a retry-on-fetch-failure check. If
# Command-based dynamic routing ever causes trouble in your installed
# langgraph version, you can restore the original wiring by re-adding:
#
#   builder.add_conditional_edges(
#       "scraper", route_after_scraper,
#       {"peer_scraper": "peer_scraper", "analyzer": "analyzer"},
#   )
#
# in place of the "scraper" -> "scrape_guard" edge in build_graph() below.
def route_after_scraper(state: AgentState) -> str:
    if state.get("intent") == "compare":
        return "peer_scraper"
    return "analyzer"


def scrape_guard_node(state: AgentState) -> Command:
    """
    Dynamic checkpoint immediately after the scraper.

    - If a fetch for a handle the user actually provided came back as a
      hard failure (detected via the "[Scraper/CF]" / "[Scraper/LC]" error
      tags that scraper_node/_do_scrape attach), retry the scrape once
      before giving up on it — rather than silently running the rest of
      the pipeline against empty data. Capped at one retry via
      state["scrape_retry_count"] to make an infinite loop impossible.
    - Otherwise, routes onward exactly like the old route_after_scraper()
      did: "compare" intent → peer_scraper, everything else → analyzer.

    This demonstrates a genuinely dynamic Command-based node (one that can
    loop back to an earlier node based on runtime results) rather than a
    plain conditional-edge function, which can only pick from a fixed set
    of forward destinations.
    """
    intent      = state.get("intent", "report")
    errors      = list(state.get("errors") or [])
    retry_count = state.get("scrape_retry_count", 0)

    cf_username = (state.get("cf_username") or "").strip()
    lc_username = (state.get("lc_username") or "").strip()

    scraper_errors  = [e for e in errors if e.startswith("[Scraper/CF]") or e.startswith("[Scraper/LC]")]
    cf_fetch_failed = bool(cf_username) and any(e.startswith("[Scraper/CF]") for e in scraper_errors)
    lc_fetch_failed = bool(lc_username) and any(e.startswith("[Scraper/LC]") for e in scraper_errors)

    if (cf_fetch_failed or lc_fetch_failed) and retry_count < 1:
        print(f"[ScrapeGuard] Fetch failure detected {scraper_errors} — retrying scrape once "
              f"(retry {retry_count + 1}/1).")
        update = {"scrape_retry_count": retry_count + 1}
        # Only null out the piece that actually failed, so scraper_node
        # re-fetches just that one and keeps whatever already succeeded.
        if cf_fetch_failed:
            update["cf_data"] = None
        if lc_fetch_failed:
            update["lc_data"] = None
        return Command(goto="scraper", update=update)

    if intent == "compare":
        return Command(goto="peer_scraper")
    return Command(goto="analyzer")


def route_after_analyzer(state: AgentState) -> str:
    """
    Standard routing after analysis, PLUS a dynamic guard: if a study plan
    was requested but there's no usable data to build one from (no weak
    topics identified AND both CF and LC data are genuinely empty — e.g.
    the scrape failed even after scrape_guard_node's retry), skip the
    planner's LLM call entirely and route to report_generator instead. No
    point spending an LLM call generating a "study plan" from nothing.
    """
    intent   = state.get("intent", "report")
    analysis = state.get("analysis") or {}

    weak_topics = analysis.get("weak_topics", [])
    cf_data     = state.get("cf_data") or {}
    lc_data     = state.get("lc_data") or {}
    has_any_data = bool(
        cf_data.get("solved_count") or cf_data.get("contest_history")
        or lc_data.get("total_solved") or lc_data.get("recent_submissions")
    )

    if intent in ("plan", "all") and not weak_topics and not has_any_data:
        print("[Router] Insufficient data for a study plan — "
              "routing to report_generator instead of planner.")
        return "report_generator"

    if intent == "plan":
        return "planner"
    if intent == "problems":
        return "problem_finder"
    return "report_generator"


def route_after_report(state: AgentState) -> str:
    """
    Mirrors the insufficient-data guard in route_after_analyzer: if "all"
    was requested but there's genuinely nothing to plan from, don't chain
    into the planner after the report either.
    """
    if state.get("intent") != "all":
        return END

    analysis    = state.get("analysis") or {}
    weak_topics = analysis.get("weak_topics", [])
    cf_data     = state.get("cf_data") or {}
    lc_data     = state.get("lc_data") or {}
    has_any_data = bool(
        cf_data.get("solved_count") or cf_data.get("contest_history")
        or lc_data.get("total_solved") or lc_data.get("recent_submissions")
    )

    if weak_topics or has_any_data:
        return "planner"
    return END


def route_after_hitl(state: AgentState) -> str:
    plan = state.get("plan") or {}
    if plan.get("status") == "approved":
        return END
    return "planner"


# ── graph builder ────────────────────────────────────────────────────────────

def build_graph(use_checkpointing: bool = True):
    builder = StateGraph(AgentState)

    # ── nodes ──────────────────────────────────────────────────────────────
    builder.add_node("supervisor",        supervisor_node)
    builder.add_node("scraper",           scraper_node)
    builder.add_node("scrape_guard",      scrape_guard_node)      # NEW — dynamic retry/routing
    builder.add_node("peer_scraper",      peer_scraper_node)      # NEW
    builder.add_node("comparison_agent",  comparison_agent_node)  # NEW
    builder.add_node("analyzer",          analyzer_node)
    builder.add_node("report_generator",  report_generator_node)
    builder.add_node("planner",           planner_node)
    builder.add_node("hitl",              hitl_node)
    builder.add_node("problem_finder",    problem_finder_node)

    # ── fixed edges ────────────────────────────────────────────────────────
    builder.add_edge(START, "supervisor")

    # NOTE: there is deliberately no static "supervisor" -> "scraper" edge.
    # supervisor_node itself now returns a Command(goto=...) that either
    # sends execution to "scraper" or short-circuits straight to END (when
    # there's no CF/LC handle to work with at all) — see agents/supervisor.py.

    # scraper always passes through scrape_guard, which dynamically decides
    # whether to retry the scrape once or continue on (replaces the old
    # static route_after_scraper conditional-edge — see scrape_guard_node's
    # docstring above for the rollback path if needed).
    builder.add_edge("scraper", "scrape_guard")

    # ── compare path: peer_scraper → comparison_agent → END ───────────────
    builder.add_edge("peer_scraper",     "comparison_agent")
    builder.add_edge("comparison_agent", END)

    # ── standard path: analyzer → report | planner | problem_finder ───────
    builder.add_conditional_edges(
        "analyzer",
        route_after_analyzer,
        {
            "report_generator": "report_generator",
            "planner":          "planner",
            "problem_finder":   "problem_finder",
        },
    )

    builder.add_edge("problem_finder", END)

    builder.add_conditional_edges(
        "report_generator",
        route_after_report,
        {"planner": "planner", END: END},
    )

    builder.add_edge("planner", "hitl")

    builder.add_conditional_edges(
        "hitl",
        route_after_hitl,
        {"planner": "planner", END: END},
    )

    # ── compile ────────────────────────────────────────────────────────────
    if use_checkpointing:
        return builder.compile(checkpointer=get_checkpointer())
    return builder.compile()

def make_config(cf_username: str, lc_username: str, intent: str = "", extra_tags: list = None) -> dict:
    """
    Builds the per-run LangGraph config: thread_id for checkpointing, plus
    tags/metadata/run_name for LangSmith tracing.

    The tags/metadata/run_name fields are inert when LangSmith isn't
    configured (LANGCHAIN_TRACING_V2 unset) — LangChain simply ignores them
    if no tracer is attached, so this is safe to always include rather than
    branching on whether tracing is enabled. See README's "Observability"
    section for how to turn tracing on.
    """
    thread_id = make_thread_id(cf_username, lc_username)

    tags = ["upsolvers"]
    if intent:
        tags.append(intent)
    tags.extend(extra_tags or [])

    return {
        "configurable": {"thread_id": thread_id},
        "tags": tags,
        "metadata": {
            "cf_username": cf_username,
            "lc_username": lc_username,
            "intent": intent or "unknown",
        },
        "run_name": f"{intent or 'run'}:{cf_username or '-'}/{lc_username or '-'}",
    }