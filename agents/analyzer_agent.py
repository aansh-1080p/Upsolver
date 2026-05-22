"""
agents/analyzer_agent.py
-------------------------
Week 2 — LangGraph node that crunches raw CF + LC data
into structured analysis using pandas, then calls the LLM
to generate a plain-English narrative summary.

Output stored in state["analysis"].
"""

import os
from datetime import datetime, timezone

import pandas as pd

from graph.state      import AgentState
from agents.llm_utils import get_text_from_llm


# ── helpers ───────────────────────────────────────────────────────────────────

def _safe_float(v, default=0.0) -> float:
    try:
        return float(v) if v is not None else default
    except Exception:
        return default


def _safe_int(v, default=0) -> int:
    try:
        return int(v) if v is not None else default
    except Exception:
        return default


# ── pandas analysis ───────────────────────────────────────────────────────────

def _analyze_cf(cf_data: dict) -> dict:
    """Compute CF stats from raw data using pandas."""
    result = {
        "cf_rating":        _safe_int(cf_data.get("rating")),
        "cf_max_rating":    _safe_int(cf_data.get("max_rating")),
        "cf_rank":          cf_data.get("rank", "unrated"),
        "cf_solved":        _safe_int(cf_data.get("solved_count")),
        "cf_contests":      0,
        "avg_rating_change": 0.0,
        "best_rank":        0,
        "worst_rank":       0,
        "wa_rate":          0.0,
        "tle_rate":         0.0,
        "peak_hour":        0,
        "weak_tags":        [],
        "strong_tags":      [],
    }

    # contest history stats
    contests = cf_data.get("contest_history", [])
    if contests:
        result["cf_contests"] = len(contests)
        changes = [_safe_int(c.get("ratingChange")) for c in contests]
        ranks   = [_safe_int(c.get("rank")) for c in contests if c.get("rank")]
        result["avg_rating_change"] = round(sum(changes) / len(changes), 2)
        result["best_rank"]  = min(ranks) if ranks else 0
        result["worst_rank"] = max(ranks) if ranks else 0

    # submissions DataFrame
    subs = cf_data.get("submissions", [])
    if not subs:
        return result

    df = pd.DataFrame(subs)
    for col in ["verdict", "problem_tags", "timestamp"]:
        if col not in df.columns:
            df[col] = None

    df["verdict"]      = df["verdict"].fillna("UNKNOWN")
    df["problem_tags"] = df["problem_tags"].apply(lambda x: x if isinstance(x, list) else [])
    df["timestamp"]    = pd.to_numeric(df["timestamp"], errors="coerce").fillna(0).astype(int)

    total = len(df)
    if total > 0:
        result["wa_rate"]  = round(len(df[df["verdict"] == "WRONG_ANSWER"])         / total, 3)
        result["tle_rate"] = round(len(df[df["verdict"] == "TIME_LIMIT_EXCEEDED"]) / total, 3)

    # peak solving hour
    df["hour"] = df["timestamp"].apply(
        lambda ts: datetime.fromtimestamp(ts, tz=timezone.utc).hour if ts > 0 else None
    )
    hour_counts = df["hour"].dropna().astype(int).value_counts()
    if not hour_counts.empty:
        result["peak_hour"] = int(hour_counts.idxmax())

    # tag-level weakness analysis
    tag_rows = [
        {"tag": tag, "verdict": row["verdict"]}
        for _, row in df.iterrows()
        for tag in row["problem_tags"]
    ]

    if tag_rows:
        tdf     = pd.DataFrame(tag_rows)
        grouped = tdf.groupby("tag")["verdict"].agg(
            attempts="count",
            failures=lambda v: (v != "OK").sum()
        ).reset_index()
        grouped["failure_rate"] = (grouped["failures"] / grouped["attempts"]).round(3)
        grouped = grouped[grouped["attempts"] >= 3]

        result["weak_tags"]   = grouped.sort_values("failure_rate", ascending=False).head(7).to_dict(orient="records")
        result["strong_tags"] = grouped.sort_values("failure_rate", ascending=True).head(5).to_dict(orient="records")

    return result


def _analyze_lc(lc_data: dict) -> dict:
    """Compute LC stats from raw data."""
    result = {
        "lc_solved":         _safe_int(lc_data.get("total_solved")),
        "lc_easy":           _safe_int(lc_data.get("easy_solved")),
        "lc_medium":         _safe_int(lc_data.get("medium_solved")),
        "lc_hard":           _safe_int(lc_data.get("hard_solved")),
        "lc_contest_rating": _safe_float(lc_data.get("contest_rating")),
        "lc_contests":       _safe_int(lc_data.get("contest_attended")),
        "consistency_score": 0.0,
        "lc_weak_tags":      [],
        "lc_strong_tags":    [],
    }

    # consistency from submission calendar
    calendar = lc_data.get("submission_calendar") or {}
    if calendar:
        now    = datetime.now(tz=timezone.utc)
        cutoff = now.timestamp() - (90 * 86400)
        recent = [ts for ts in calendar if float(ts) >= cutoff]
        result["consistency_score"] = round(min(len(recent) / 90.0, 1.0), 3)

    # LC skill tag weakness
    all_tags = (
        [{"tag": t.get("tagName",""), "solved": t.get("problemsSolved", 0)}
         for t in lc_data.get("skill_tags_advanced", [])]
        + [{"tag": t.get("tagName",""), "solved": t.get("problemsSolved", 0)}
           for t in lc_data.get("skill_tags_intermediate", [])]
        + [{"tag": t.get("tagName",""), "solved": t.get("problemsSolved", 0)}
           for t in lc_data.get("skill_tags_fundamental", [])]
    )

    if all_tags:
        tdf = pd.DataFrame(all_tags)
        result["lc_weak_tags"]   = tdf.nsmallest(5, "solved")[["tag","solved"]].to_dict(orient="records")
        result["lc_strong_tags"] = tdf.nlargest(5,  "solved")[["tag","solved"]].to_dict(orient="records")

    return result


def _merge_weak_topics(cf_stats: dict, lc_stats: dict) -> list[dict]:
    weak = []
    for t in cf_stats.get("weak_tags", []):
        weak.append({
            "tag":          t["tag"],
            "platform":     "codeforces",
            "attempts":     int(t.get("attempts", 0)),
            "failures":     int(t.get("failures", 0)),
            "failure_rate": float(t.get("failure_rate", 0)),
        })
    for t in lc_stats.get("lc_weak_tags", []):
        weak.append({
            "tag":          t["tag"],
            "platform":     "leetcode",
            "attempts":     int(t.get("solved", 0)),
            "failures":     0,
            "failure_rate": 0.0,
        })
    return weak


def _merge_strong_topics(cf_stats: dict, lc_stats: dict) -> list[dict]:
    strong = []
    for t in cf_stats.get("strong_tags", []):
        strong.append({"tag": t["tag"], "platform": "codeforces",
                       "failure_rate": float(t.get("failure_rate", 0))})
    for t in lc_stats.get("lc_strong_tags", []):
        strong.append({"tag": t["tag"], "platform": "leetcode",
                       "solved": int(t.get("solved", 0))})
    return strong


# ── LLM narrative ─────────────────────────────────────────────────────────────

def _build_narrative_prompt(cf_stats: dict, lc_stats: dict) -> str:
    weak_str = ", ".join(
        f"{t['tag']} ({t['failure_rate']*100:.0f}% fail rate)"
        for t in cf_stats.get("weak_tags", [])[:5]
    ) or "not enough data"

    strong_str = ", ".join(
        t["tag"] for t in cf_stats.get("strong_tags", [])[:5]
    ) or "not enough data"

    lc_weak_str = ", ".join(
        t["tag"] for t in lc_stats.get("lc_weak_tags", [])[:5]
    ) or "not enough data"

    return f"""You are a competitive programming coach. Write a short honest performance summary.

=== Codeforces ===
Rating: {cf_stats['cf_rating']} (peak {cf_stats['cf_max_rating']}, rank: {cf_stats['cf_rank']})
Contests: {cf_stats['cf_contests']}, Avg rating change: {cf_stats['avg_rating_change']:+.1f}
Best rank: {cf_stats['best_rank']}, Worst rank: {cf_stats['worst_rank']}
Problems solved: {cf_stats['cf_solved']}
WA rate: {cf_stats['wa_rate']*100:.1f}%, TLE rate: {cf_stats['tle_rate']*100:.1f}%
Weak topics: {weak_str}
Strong topics: {strong_str}
Peak solving hour: {cf_stats['peak_hour']}:00 UTC

=== LeetCode ===
Solved: {lc_stats['lc_solved']} (E{lc_stats['lc_easy']} M{lc_stats['lc_medium']} H{lc_stats['lc_hard']})
Contest rating: {lc_stats['lc_contest_rating']:.0f}, Attended: {lc_stats['lc_contests']}
Consistency (90d): {lc_stats['consistency_score']*100:.0f}%
Weak LC topics: {lc_weak_str}

Write exactly 3 short paragraphs:
1. Overall snapshot using the exact numbers above.
2. Key weaknesses that are hurting their performance.
3. Top 3 concrete actions to take this week.

Under 200 words. No bullet points. Plain text only."""


def _call_llm_narrative(prompt: str) -> str:
    """
    Call LLM for free-text narrative using call_llm() which handles
    Gemini 429 / RESOURCE_EXHAUSTED with automatic retry + model fallback.
    """
    from agents.llm_utils import call_llm
    from langchain_core.messages import HumanMessage as HM
    raw = call_llm([HM(content=prompt)], temperature=0.4)
    text = get_text_from_llm(raw)
    return text if text else "[Narrative unavailable — LLM returned empty response]"


# ── LangGraph node ────────────────────────────────────────────────────────────

def analyzer_node(state: AgentState) -> dict:
    """
    LangGraph node — reads cf_data/lc_data from state,
    computes stats with pandas, generates narrative with LLM.
    Returns partial state update: state["analysis"].
    """
    cf_data = state.get("cf_data") or {}
    lc_data = state.get("lc_data") or {}
    errors  = list(state.get("errors") or [])

    if not cf_data and not lc_data:
        errors.append("[Analyzer] No data to analyze.")
        return {"analysis": None, "errors": errors}

    print("[Analyzer] Running pandas analysis...")
    cf_stats = _analyze_cf(cf_data)
    lc_stats = _analyze_lc(lc_data)

    print("[Analyzer] Calling LLM for narrative...")
    prompt    = _build_narrative_prompt(cf_stats, lc_stats)
    narrative = _call_llm_narrative(prompt)
    print(f"[Analyzer] Narrative ready ({len(narrative)} chars).")

    analysis = {
        "weak_topics":        _merge_weak_topics(cf_stats, lc_stats),
        "strong_topics":      _merge_strong_topics(cf_stats, lc_stats),
        "consistency_score":  lc_stats["consistency_score"],
        "avg_rating_change":  cf_stats["avg_rating_change"],
        "best_contest_rank":  cf_stats["best_rank"],
        "worst_contest_rank": cf_stats["worst_rank"],
        "peak_solving_hour":  cf_stats.get("peak_hour", 0),
        "wa_rate":            cf_stats["wa_rate"],
        "tle_rate":           cf_stats["tle_rate"],
        "narrative":          narrative,
        "_cf":                cf_stats,
        "_lc":                lc_stats,
    }

    print(f"[Analyzer] Done — "
          f"weak_topics={len(analysis['weak_topics'])}, "
          f"consistency={analysis['consistency_score']*100:.0f}%")

    return {"analysis": analysis, "errors": errors}