"""
graph/graph_builder.py
-----------------------
Week 4 — complete graph.

Full flow by intent:

  report   → supervisor → scraper → analyzer → report_generator → END
  plan     → supervisor → scraper → analyzer → planner → hitl → [END | planner cycle]
  problems → supervisor → scraper → analyzer → problem_finder → END
  all      → supervisor → scraper → analyzer → report_generator
                                             → planner → hitl → [END | planner cycle]

Note: "all" does report + plan. Problem finder is intentionally separate
because combining 3 workflows in one run would be too slow for a solo project.

LangGraph features demonstrated:
  - StateGraph + TypedDict state
  - 4 conditional edge functions
  - planner → hitl → planner cycle (re-generation loop)
  - interrupt() inside hitl_node  (Human-in-the-loop)
  - SqliteSaver checkpointing
"""

"""
graph/graph_builder.py
-----------------------
Upsolvers — complete graph including peer comparison.

Flows by intent:

  report   → supervisor → scraper → analyzer → report_generator → END
  plan     → supervisor → scraper → analyzer → planner → hitl → [END | planner cycle]
  problems → supervisor → scraper → analyzer → problem_finder → END
  all      → supervisor → scraper → analyzer → report_generator → planner → hitl → END
  compare  → supervisor → scraper → peer_scraper → comparison_agent → END

Key: compare intent SKIPS the analyzer entirely — it has its own analysis
     logic inside comparison_agent that runs _analyze_cf/_analyze_lc on both
     profiles and produces a head-to-head diff.
"""

from langgraph.graph import StateGraph, START, END

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

def route_after_scraper(state: AgentState) -> str:
    """
    After the primary scraper:
    - compare intent → peer_scraper (skip analyzer)
    - everything else → analyzer
    """
    if state.get("intent") == "compare":
        return "peer_scraper"
    return "analyzer"


def route_after_analyzer(state: AgentState) -> str:
    intent = state.get("intent", "report")
    if intent == "plan":
        return "planner"
    if intent == "problems":
        return "problem_finder"
    if intent == "all":
        return "report_generator"
    return "report_generator"


def route_after_report(state: AgentState) -> str:
    if state.get("intent") == "all":
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
    builder.add_node("peer_scraper",      peer_scraper_node)      # NEW
    builder.add_node("comparison_agent",  comparison_agent_node)  # NEW
    builder.add_node("analyzer",          analyzer_node)
    builder.add_node("report_generator",  report_generator_node)
    builder.add_node("planner",           planner_node)
    builder.add_node("hitl",              hitl_node)
    builder.add_node("problem_finder",    problem_finder_node)

    # ── fixed edges ────────────────────────────────────────────────────────
    builder.add_edge(START,        "supervisor")
    builder.add_edge("supervisor", "scraper")

    # ── after scraper: compare → peer_scraper, else → analyzer ────────────
    builder.add_conditional_edges(
        "scraper",
        route_after_scraper,
        {
            "peer_scraper": "peer_scraper",
            "analyzer":     "analyzer",
        },
    )

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


def make_config(cf_username: str, lc_username: str) -> dict:
    return {"configurable": {"thread_id": make_thread_id(cf_username, lc_username)}}