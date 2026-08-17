"""
agents/supervisor.py
---------------------
Supervisor node — classifies user intent from their message, then
dynamically routes to the next node via a LangGraph Command.

Returns one of: "report" | "plan" | "problems" | "all" | "compare"

"compare" is triggered when the user mentions comparing with someone, a
friend, peer, rival, or another handle.

Uses the LLM for classification. If the LLM fails or returns unexpected
output, falls back to fast keyword matching so the graph never stalls.

Dynamic routing: supervisor_node returns a Command that both updates state
AND chooses where execution goes next, instead of relying purely on a
static edge. Concretely: if there's no CF or LC handle to work with at all,
it short-circuits straight to END rather than running the rest of the
pipeline (scraper → analyzer → ...) against empty input.
"""

import re
from graph.state      import AgentState
from agents.llm_utils import get_text_from_llm
from langgraph.graph  import END
from langgraph.types  import Command

VALID_INTENTS = {"report", "plan", "problems", "all", "compare"}

_CLASSIFICATION_PROMPT = """\
You are an intent classifier for a competitive programming assistant called Upsolvers.
Classify the user request into EXACTLY ONE of these five labels:

  report   → user wants a performance analysis or report of their own stats
  plan     → user wants a study plan, roadmap, or timeline to improve
  problems → user wants practice problems to solve
  compare  → user wants to compare their profile with another person / friend / rival
  all      → user wants more than one of the above (but NOT compare)

User message: "{message}"

Reply with ONLY the single label word. No punctuation, no explanation."""


def _keyword_fallback(text: str) -> str:
    t = text.lower()
    wants_compare  = any(w in t for w in ["compare", "vs", "versus", "friend", "rival",
                                           "peer", "better than", "against"])
    wants_plan     = any(w in t for w in ["plan", "study", "schedule", "roadmap",
                                           "timeline", "improve", "week"])
    wants_problems = any(w in t for w in ["problem", "practice", "question",
                                           "exercise", "solve"])
    wants_report   = any(w in t for w in ["report", "analysis", "analyze",
                                           "performance", "stats", "overview"])

    if wants_compare:
        return "compare"
    hits = sum([wants_plan, wants_problems, wants_report])
    if hits >= 2:
        return "all"
    if wants_plan:
        return "plan"
    if wants_problems:
        return "problems"
    return "report"


def _classify(user_message: str) -> str:
    from agents.llm_utils import call_llm
    from langchain_core.messages import HumanMessage as HM

    prompt = _CLASSIFICATION_PROMPT.format(message=user_message)
    try:
        raw   = call_llm([HM(content=prompt)], temperature=0.0)
        clean = get_text_from_llm(raw).lower().strip().strip('"').strip("'")
        match = re.search(r"\b(report|plan|problems|all|compare)\b", clean)
        if match:
            intent = match.group(1)
            print(f"[Supervisor] LLM intent: {intent!r}")
            return intent
        print(f"[Supervisor] Unexpected LLM output: {clean!r} — keyword fallback")
        return _keyword_fallback(user_message)
    except Exception as e:
        print(f"[Supervisor] LLM failed ({type(e).__name__}: {e}) — keyword fallback")
        return _keyword_fallback(user_message)


def supervisor_node(state: AgentState) -> Command:
    """
    LangGraph node — classify intent from the last user message, then
    dynamically route via Command instead of a static add_edge.

    If no messages (CLI mode), keep the existing intent. If there's no CF
    or LC handle at all, short-circuit straight to END — there's nothing
    for scraper/analyzer/etc. to do with empty input.
    """
    messages        = state.get("messages") or []
    existing_intent = state.get("intent", "report")
    errors          = list(state.get("errors") or [])

    if existing_intent in VALID_INTENTS and not messages:
        intent = existing_intent
        print(f"[Supervisor] No messages — keeping intent={intent!r}")
    else:
        user_text = ""
        for msg in reversed(messages):
            if hasattr(msg, "content"):
                user_text = msg.content or ""
                break
            if isinstance(msg, dict):
                user_text = msg.get("content") or msg.get("text") or ""
                break

        if not user_text.strip():
            intent = existing_intent
            print(f"[Supervisor] Empty message — defaulting to intent={intent!r}")
        else:
            print(f"[Supervisor] Classifying: {user_text[:80]!r}")
            intent = _classify(user_text)
            print(f"[Supervisor] Final intent = {intent!r}")

    cf_username = (state.get("cf_username") or "").strip()
    lc_username = (state.get("lc_username") or "").strip()

    if not cf_username and not lc_username:
        errors.append("[Supervisor] No Codeforces or LeetCode handle provided — nothing to do.")
        print("[Supervisor] No usable input — routing straight to END.")
        return Command(goto=END, update={"intent": intent, "errors": errors})

    return Command(goto="scraper", update={"intent": intent})