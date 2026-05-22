"""
agents/comparison_agent.py
---------------------------
LangGraph node that compares two CP profiles head-to-head.

Reads:
  state["cf_data"]  / state["lc_data"]   → primary user
  state["cf_data2"] / state["lc_data2"]  → peer

Produces state["comparison"] with:
  {
    "your_handle", "peer_handle",
    "you":         { cf_stats, lc_stats },
    "peer":        { cf_stats, lc_stats },
    "diff":        { signed numeric deltas },
    "common_weak": [ tags both players struggle with ],
    "your_edge":   [ tags you clearly beat peer on ],
    "peer_edge":   [ tags peer clearly beats you on ],
    "narrative":   str  — LLM coaching paragraph (clean, no think tags),
  }

Reuses _analyze_cf() and _analyze_lc() from analyzer_agent.
"""

from agents.llm_utils   import get_text_from_llm
from agents.analyzer_agent import _analyze_cf, _analyze_lc
from graph.state        import AgentState


# ── bug fix: robust think-tag stripping ──────────────────────────────────────

def _strip_all_noise(raw: str) -> str:
    """
    Strip <think>...</think> blocks AND unclosed <think> tags.

    The standard re.sub(r"<think>.*?</think>", ...) fails when:
      - The model emits <think> without a closing </think>
      - Line endings are mixed (\r\n vs \n)

    We handle all three cases explicitly:
      1. Complete blocks: <think>...</think>
      2. Unclosed opening tag: <think>... to end of string
      3. Any leftover <think> or </think> bare tags
    """
    import re
    # Case 1: complete block (greedy [\s\S] is more reliable than .*? with DOTALL)
    text = re.sub(r"<think>[\s\S]*?</think>", "", raw)
    # Case 2: unclosed block — everything from <think> to end of string
    text = re.sub(r"<think>[\s\S]*$", "", text)
    # Case 3: stray closing tags
    text = re.sub(r"</think>", "", text)
    return text.strip()


# ── comparison helpers ────────────────────────────────────────────────────────

def _compare_cf_tags(
    you_stats: dict, peer_stats: dict
) -> tuple[list, list, list]:
    """
    Compare tag-level failure rates.
    Returns (common_weak, your_edge, peer_edge).

    common_weak — both players have failure_rate > 0.5
    your_edge   — your failure_rate is 15+ pp lower than peer's
    peer_edge   — peer's failure_rate is 15+ pp lower than yours
    """
    you_map  = {t["tag"]: t["failure_rate"]
                for t in you_stats.get("weak_tags", []) + you_stats.get("strong_tags", [])}
    peer_map = {t["tag"]: t["failure_rate"]
                for t in peer_stats.get("weak_tags", []) + peer_stats.get("strong_tags", [])}
    common   = set(you_map) & set(peer_map)

    common_weak, your_edge, peer_edge = [], [], []
    for tag in common:
        yr = you_map[tag]
        pr = peer_map[tag]
        if yr > 0.5 and pr > 0.5:
            common_weak.append({
                "tag": tag, "your_rate": round(yr * 100), "peer_rate": round(pr * 100),
            })
        elif (pr - yr) >= 0.15:   # you are better (lower fail rate)
            your_edge.append({
                "tag": tag, "your_rate": round(yr * 100), "peer_rate": round(pr * 100),
                "advantage": round((pr - yr) * 100),
            })
        elif (yr - pr) >= 0.15:   # peer is better
            peer_edge.append({
                "tag": tag, "your_rate": round(yr * 100), "peer_rate": round(pr * 100),
                "advantage": round((yr - pr) * 100),
            })

    common_weak.sort(key=lambda x: (x["your_rate"] + x["peer_rate"]) / 2, reverse=True)
    your_edge.sort(key=lambda x: x["advantage"], reverse=True)
    peer_edge.sort(key=lambda x: x["advantage"], reverse=True)
    return common_weak[:5], your_edge[:5], peer_edge[:5]


def _build_diff(you_cf: dict, you_lc: dict, peer_cf: dict, peer_lc: dict) -> dict:
    """Signed deltas — positive = you are ahead."""
    return {
        "cf_rating":         you_cf["cf_rating"]         - peer_cf["cf_rating"],
        "cf_max_rating":     you_cf["cf_max_rating"]      - peer_cf["cf_max_rating"],
        "cf_solved":         you_cf["cf_solved"]          - peer_cf["cf_solved"],
        "cf_contests":       you_cf["cf_contests"]        - peer_cf["cf_contests"],
        "avg_rating_change": round(you_cf["avg_rating_change"] - peer_cf["avg_rating_change"], 2),
        "wa_rate":           round(you_cf["wa_rate"]      - peer_cf["wa_rate"], 3),
        "tle_rate":          round(you_cf["tle_rate"]     - peer_cf["tle_rate"], 3),
        "lc_solved":         you_lc["lc_solved"]          - peer_lc["lc_solved"],
        "lc_hard":           you_lc["lc_hard"]            - peer_lc["lc_hard"],
        "lc_contest_rating": round(you_lc["lc_contest_rating"] - peer_lc["lc_contest_rating"], 1),
        "consistency":       round(you_lc["consistency_score"] - peer_lc["consistency_score"], 3),
    }


# ── improved prompt ───────────────────────────────────────────────────────────

def _build_comparison_prompt(
    you_cf: dict, you_lc: dict,
    peer_cf: dict, peer_lc: dict,
    diff: dict,
    common_weak: list, your_edge: list, peer_edge: list,
    your_handle: str, peer_handle: str,
) -> str:
    """
    Build a tightly constrained prompt that:
    - Gives the LLM all numbers it needs up front
    - Tells it EXACTLY what format to use
    - Explicitly forbids XML tags, bullet points, think blocks
    - Is specific enough to get quality output instead of vague advice
    """

    def _tags(lst, k1="your_rate", k2="peer_rate"):
        if not lst:
            return "none found"
        return " | ".join(
            f"{t['tag']} (you {t[k1]}% vs peer {t[k2]}%)" for t in lst
        )

    cf_rating_winner  = your_handle if diff["cf_rating"] >= 0 else peer_handle
    cf_rating_gap     = abs(diff["cf_rating"])
    lc_solved_winner  = your_handle if diff["lc_solved"] >= 0 else peer_handle
    lc_solved_gap     = abs(diff["lc_solved"])
    consistency_ahead = your_handle if diff["consistency"] >= 0 else peer_handle

    return f"""You are a competitive programming coach writing a head-to-head analysis.

CRITICAL RULES — follow exactly:
- Output only plain text. No XML tags. No <think> blocks. No markdown. No bullet points. No headers.
- Write exactly 3 paragraphs separated by a blank line.
- Stay under 220 words total.
- Use the exact numbers provided. Do not invent or approximate.

PLAYER DATA:

{your_handle}:
  CF rating: {you_cf['cf_rating']} (peak {you_cf['cf_max_rating']}, rank: {you_cf['cf_rank']})
  CF problems solved (last 200 subs): {you_cf['cf_solved']}
  CF contests: {you_cf['cf_contests']}, avg rating change per contest: {you_cf['avg_rating_change']:+.1f}
  CF wrong-answer rate: {you_cf['wa_rate']*100:.1f}%, TLE rate: {you_cf['tle_rate']*100:.1f}%
  LC problems solved: {you_lc['lc_solved']} (Easy {you_lc['lc_easy']}, Medium {you_lc['lc_medium']}, Hard {you_lc['lc_hard']})
  LC contest rating: {you_lc['lc_contest_rating']:.0f}
  Consistency last 90 days: {you_lc['consistency_score']*100:.0f}%

{peer_handle}:
  CF rating: {peer_cf['cf_rating']} (peak {peer_cf['cf_max_rating']}, rank: {peer_cf['cf_rank']})
  CF problems solved (last 200 subs): {peer_cf['cf_solved']}
  CF contests: {peer_cf['cf_contests']}, avg rating change per contest: {peer_cf['avg_rating_change']:+.1f}
  CF wrong-answer rate: {peer_cf['wa_rate']*100:.1f}%, TLE rate: {peer_cf['tle_rate']*100:.1f}%
  LC problems solved: {peer_lc['lc_solved']} (Easy {peer_lc['lc_easy']}, Medium {peer_lc['lc_medium']}, Hard {peer_lc['lc_hard']})
  LC contest rating: {peer_lc['lc_contest_rating']:.0f}
  Consistency last 90 days: {peer_lc['consistency_score']*100:.0f}%

GAP SUMMARY:
  CF rating: {cf_rating_winner} leads by {cf_rating_gap} points
  LC solved: {lc_solved_winner} has solved {lc_solved_gap} more problems
  Consistency: {consistency_ahead} is more consistent by {abs(diff['consistency'])*100:.0f}%
  Tags both struggle with: {_tags(common_weak)}
  {your_handle}'s strong tags vs peer: {_tags(your_edge)}
  {peer_handle}'s strong tags vs {your_handle}: {_tags(peer_edge)}

Write the 3 paragraphs now. Paragraph 1: overall standings using the exact numbers. Paragraph 2: each player's clearest edge over the other, referencing specific tags and rates. Paragraph 3: the single most impactful thing {your_handle} must do in the next 2 weeks to close the gap, be very specific."""


def _call_llm(prompt: str) -> str:
    """
    Call LLM and robustly clean the response.
    Applies _strip_all_noise() on top of get_text_from_llm() to catch
    all edge cases where think tags are not properly closed.
    """
    from agents.llm_utils import call_llm
    from langchain_core.messages import HumanMessage as HM

    raw  = call_llm([HM(content=prompt)], temperature=0.3)
    # Two-pass cleaning: strip_all_noise handles unclosed tags,
    # then get_text_from_llm for any remaining standard think blocks
    text = _strip_all_noise(raw)
    text = get_text_from_llm(text)
    return text.strip() if text.strip() else "[Comparison narrative unavailable]"


# ── LangGraph node ────────────────────────────────────────────────────────────

def comparison_agent_node(state: AgentState) -> dict:
    """
    LangGraph node — compare primary user vs peer.
    Writes state["comparison"].
    """
    cf_data  = state.get("cf_data")  or {}
    lc_data  = state.get("lc_data")  or {}
    cf_data2 = state.get("cf_data2") or {}
    lc_data2 = state.get("lc_data2") or {}
    errors   = list(state.get("errors") or [])

    your_handle = cf_data.get("handle")  or state.get("cf_username")  or "You"
    peer_handle = cf_data2.get("handle") or state.get("cf_username2") or "Peer"

    print(f"[Comparison] {your_handle!r} vs {peer_handle!r}")

    you_cf  = _analyze_cf(cf_data)
    you_lc  = _analyze_lc(lc_data)
    peer_cf = _analyze_cf(cf_data2)
    peer_lc = _analyze_lc(lc_data2)

    diff = _build_diff(you_cf, you_lc, peer_cf, peer_lc)
    common_weak, your_edge, peer_edge = _compare_cf_tags(you_cf, peer_cf)

    print("[Comparison] Calling LLM...")
    prompt    = _build_comparison_prompt(
        you_cf, you_lc, peer_cf, peer_lc,
        diff, common_weak, your_edge, peer_edge,
        your_handle, peer_handle,
    )
    narrative = _call_llm(prompt)
    print(f"[Comparison] Narrative ready ({len(narrative)} chars).")

    return {
        "comparison": {
            "your_handle": your_handle,
            "peer_handle": peer_handle,
            "you":         {"cf": you_cf, "lc": you_lc},
            "peer":        {"cf": peer_cf, "lc": peer_lc},
            "diff":        diff,
            "common_weak": common_weak,
            "your_edge":   your_edge,
            "peer_edge":   peer_edge,
            "narrative":   narrative,
        },
        "errors": errors,
    }