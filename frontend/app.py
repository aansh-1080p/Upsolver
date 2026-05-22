"""
frontend/app.py
----------------
Upsolvers — complete Streamlit UI.

Four tabs:
  1. Performance Report  — analysis, CF chart, weak topics, PDF
  2. Study Plan          — HITL plan: generate → review → approve/revise → done
  3. Practice Problems   — CF + CSES + LC problems by weak topic
  4. Peer Comparison     — head-to-head profile comparison with a friend

Run:
    streamlit run frontend/app.py
"""

import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import streamlit as st
from dotenv import load_dotenv
load_dotenv()

st.set_page_config(
    page_title="Upsolvers",
    page_icon="🚀",
    layout="wide",
)

st.title("🚀 Upsolvers")
st.caption("Competitive Programming Intelligence · LangGraph + Groq/Gemini")

# ── sidebar ───────────────────────────────────────────────────────────────────
with st.sidebar:
    st.header("Your Profiles")
    cf_handle = st.text_input("Codeforces handle", placeholder="e.g. tourist")
    lc_handle = st.text_input("LeetCode username",  placeholder="e.g. neal_wu")

    st.divider()
    st.subheader("Study Plan Settings")
    goal       = st.text_input("Goal", placeholder="e.g. Reach CF 1600 in 2 months")
    hours_day  = st.slider("Hours per day", 1, 8, 2)
    plan_weeks = st.slider("Plan duration (weeks)", 2, 12, 4)

    st.divider()
    st.subheader("Problem Finder Settings")
    prob_difficulty = st.selectbox("Difficulty", ["easy", "medium", "hard"], index=1)
    prob_count      = st.slider("Max problems to show", 5, 30, 15)

    st.divider()
    st.subheader("Peer Comparison")
    peer_cf = st.text_input("Peer's CF handle", placeholder="e.g. petr")
    peer_lc = st.text_input("Peer's LC username", placeholder="e.g. neal_wu")


# ── shared helpers ────────────────────────────────────────────────────────────

def _make_initial_state(intent: str) -> dict:
    return {
        "cf_username":    cf_handle or "",
        "lc_username":    lc_handle or "",
        # peer fields (only used when intent="compare")
        "cf_username2":   peer_cf or "",
        "lc_username2":   peer_lc or "",
        "cf_data":        None,
        "lc_data":        None,
        "cf_data2":       None,
        "lc_data2":       None,
        "analysis":       None,
        "comparison":     None,
        "plan":           None,
        "problems":       None,
        "report_markdown": None,
        "report_pdf_path": None,
        "user_prefs": {
            "goal":               goal or "Improve competitive programming skills",
            "hours_per_day":      hours_day,
            "duration_weeks":     plan_weeks,
            "preferred_resources": [],
            "target_rating":      None,
            "problem_difficulty": prob_difficulty,
        },
        "errors":   [],
        "messages": [],
        "intent":   intent,
    }


@st.cache_resource
def _get_graph():
    from graph.graph_builder import build_graph
    return build_graph(use_checkpointing=True)


def _cfg():
    from graph.graph_builder import make_config
    return make_config(cf_handle or "", lc_handle or "")


def _compare_cfg():
    """Separate thread_id for comparison runs so they don't overwrite report cache."""
    from graph.graph_builder import make_config
    p1 = f"{cf_handle or 'u'}_{lc_handle or 'u'}"
    p2 = f"{peer_cf or 'p'}_{peer_lc or 'p'}"
    return make_config(p1, p2)


def _check_input() -> bool:
    if not cf_handle and not lc_handle:
        st.warning("Enter at least one username in the sidebar.")
        return False
    return True


def _stream_graph(intent: str, progress_labels: dict, config=None) -> dict | None:
    graph  = _get_graph()
    cfg    = config or _cfg()
    bar    = st.progress(0, text="Starting...")
    interrupted = False

    try:
        for event in graph.stream(
            _make_initial_state(intent),
            config=cfg,
            stream_mode="updates",
        ):
            node = list(event.keys())[0]
            if node in progress_labels:
                pct, label = progress_labels[node]
                bar.progress(pct, text=label)
    except Exception:
        interrupted = True

    bar.progress(100, text="Done!")
    time.sleep(0.2)
    bar.empty()

    if interrupted:
        return None
    return graph.get_state(cfg).values


# ── TABS ──────────────────────────────────────────────────────────────────────
tab_report, tab_plan, tab_problems, tab_compare = st.tabs([
    "Performance Report", "Study Plan", "Practice Problems", "Peer Comparison"
])


# ════════════════════════════════════════════════════════════════════════════
# TAB 1: REPORT
# ════════════════════════════════════════════════════════════════════════════
with tab_report:
    if st.button("Generate Report", type="primary", key="btn_report"):
        if _check_input():
            final = _stream_graph("report", {
                "supervisor":       (10, "Routing request..."),
                "scraper":          (30, "Fetching profiles..."),
                "analyzer":         (65, "Analysing performance..."),
                "report_generator": (90, "Building report..."),
            })

            if final:
                cf = final.get("cf_data")  or {}
                lc = final.get("lc_data")  or {}
                an = final.get("analysis") or {}

                for e in final.get("errors", []):
                    st.warning(e)

                st.subheader("Overview")
                c1, c2, c3, c4, c5 = st.columns(5)
                c1.metric("CF Rating",   cf.get("rating", "—"))
                c2.metric("CF Peak",     cf.get("max_rating", "—"))
                c3.metric("LC Solved",   lc.get("total_solved", "—"))
                c4.metric("LC Contest",  f"{lc.get('contest_rating', 0):.0f}"
                          if lc.get("contest_rating") else "—")
                c5.metric("Consistency", f"{an.get('consistency_score', 0)*100:.0f}%"
                          if an else "—")

                st.divider()
                col_l, col_r = st.columns([3, 2])

                with col_l:
                    st.subheader("Report")
                    md = final.get("report_markdown", "")
                    if md:
                        ph = st.empty()
                        displayed = ""
                        for i, word in enumerate(md.split(" ")):
                            displayed += word + " "
                            if i % 60 == 0:
                                ph.markdown(displayed + "▌")
                                time.sleep(0.006)
                        ph.markdown(displayed)
                    else:
                        st.info("No report generated.")

                    pdf_path = final.get("report_pdf_path")
                    if pdf_path and Path(pdf_path).exists():
                        with open(pdf_path, "rb") as f:
                            st.download_button(
                                "Download PDF Report", data=f,
                                file_name=Path(pdf_path).name,
                                mime="application/pdf",
                            )

                with col_r:
                    if cf.get("contest_history"):
                        st.subheader("CF Rating History")
                        ratings = [c.get("newRating", 0) for c in cf["contest_history"]]
                        st.line_chart({"Rating": ratings})


# ════════════════════════════════════════════════════════════════════════════
# TAB 2: STUDY PLAN (HITL)
# ════════════════════════════════════════════════════════════════════════════
with tab_plan:
    if "plan_stage" not in st.session_state:
        st.session_state.plan_stage = "idle"

    if st.button("Generate Study Plan", type="primary", key="btn_plan"):
        if _check_input():
            st.session_state.plan_stage = "running"

    if st.session_state.plan_stage == "running":
        graph  = _get_graph()
        config = _cfg()
        bar    = st.progress(0, text="Starting...")
        interrupted = False

        try:
            for event in graph.stream(
                _make_initial_state("plan"), config=config, stream_mode="updates",
            ):
                node = list(event.keys())[0]
                labels = {
                    "supervisor": (10, "Routing..."),
                    "scraper":    (25, "Fetching profiles..."),
                    "analyzer":   (50, "Analysing weak topics..."),
                    "planner":    (80, "Generating plan..."),
                    "hitl":       (95, "Ready for your review..."),
                }
                if node in labels:
                    bar.progress(*labels[node])
        except Exception:
            interrupted = True

        bar.progress(100, text="Plan ready!")
        time.sleep(0.2)
        bar.empty()
        st.session_state.plan_stage = "waiting_hitl"
        st.rerun()

    if st.session_state.plan_stage == "waiting_hitl":
        graph  = _get_graph()
        config = _cfg()
        snap   = graph.get_state(config)
        state  = snap.values
        plan   = state.get("plan") or {}
        weeks  = plan.get("weeks", [])

        if plan.get("status") == "approved":
            st.session_state.plan_stage = "done"
            st.rerun()

        st.subheader("Review Your Draft Plan")
        st.caption(f"Goal: {plan.get('goal', '—')}")

        _goal_text = goal or plan.get("goal", "improve competitive programming skills")
        _dur = plan_weeks
        _hrs = hours_day
        st.info(
            f"You asked to **{_goal_text}**, committing **{_hrs} hour(s) per day** "
            f"over **{_dur} week(s)**. "
            f"Based on your profile analysis, this plan targets your weak areas week by week, "
            f"progressively building problem-solving depth with curated resources and daily practice goals. "
            f"Review each week below and approve or request changes before locking in the plan."
        )

        for w in weeks:
            with st.expander(
                f"Week {w.get('week', '?')} — {w.get('topic', '—')}", expanded=True,
            ):
                subs = w.get("subtopics", [])
                if subs:
                    st.markdown("**Subtopics:** " + " · ".join(subs))
                for r in w.get("resources", []):
                    st.markdown(f"- [{r.get('name','Link')}]({r.get('url','#')})")
                st.caption(f"Problems per day: {w.get('problems_per_day', 3)}")

        st.divider()
        col_a, col_b = st.columns(2)

        with col_a:
            if st.button("Approve Plan", type="primary", use_container_width=True):
                graph.update_state(
                    config,
                    {"plan": {**plan, "status": "approved", "user_feedback": ""}},
                    as_node="hitl",
                )
                try:
                    for _ in graph.stream(None, config=config, stream_mode="updates"):
                        pass
                except Exception:
                    pass
                st.session_state.plan_stage = "done"
                st.rerun()

        with col_b:
            feedback = st.text_area(
                "Request changes",
                placeholder="e.g. Make week 2 focus on segment trees instead",
                key="hitl_feedback",
            )
            if st.button("Revise Plan", use_container_width=True):
                if feedback.strip():
                    graph.update_state(
                        config,
                        {"plan": {**plan, "status": "draft", "user_feedback": feedback}},
                        as_node="hitl",
                    )
                    bar2 = st.progress(0, text="Regenerating plan...")
                    try:
                        for event in graph.stream(None, config=config, stream_mode="updates"):
                            node = list(event.keys())[0]
                            if node == "planner":
                                bar2.progress(60, text="Rewriting plan...")
                            elif node == "hitl":
                                bar2.progress(95, text="Ready for review...")
                    except Exception:
                        pass
                    bar2.progress(100, text="Done!")
                    time.sleep(0.2)
                    bar2.empty()
                    st.rerun()
                else:
                    st.warning("Type your feedback before requesting revision.")

    if st.session_state.plan_stage == "done":
        graph  = _get_graph()
        config = _cfg()
        state  = graph.get_state(config).values
        plan   = state.get("plan") or {}

        st.success("Study plan approved!")
        st.subheader("Your Study Plan")
        st.caption(f"Goal: {plan.get('goal', '—')}")

        _goal_text = goal or plan.get("goal", "improve competitive programming skills")
        st.markdown(
            f"You set out to **{_goal_text}**, with **{hours_day} hour(s)/day** "
            f"over **{plan_weeks} week(s)**. "
            f"This plan was generated by analysing your Codeforces and LeetCode profiles to pinpoint weak topics, "
            f"then building a structured week-by-week schedule that progressively addresses those gaps "
            f"through targeted resources and daily problem practice."
        )

        for w in plan.get("weeks", []):
            with st.expander(f"Week {w.get('week')} — {w.get('topic', '—')}"):
                subs = w.get("subtopics", [])
                if subs:
                    st.markdown("**Subtopics:** " + " · ".join(subs))
                for r in w.get("resources", []):
                    st.markdown(f"- [{r.get('name','Link')}]({r.get('url','#')})")
                st.caption(f"Problems per day: {w.get('problems_per_day', 3)}")

        if st.button("Generate New Plan", key="btn_new_plan"):
            st.session_state.plan_stage = "idle"
            st.rerun()


# ════════════════════════════════════════════════════════════════════════════
# TAB 3: PRACTICE PROBLEMS
# ════════════════════════════════════════════════════════════════════════════
with tab_problems:
    st.caption(
        f"Finds unsolved problems matching your weak topics · "
        f"Difficulty: **{prob_difficulty}** · Sources: Codeforces, CSES, LeetCode"
    )

    if st.button("Find Problems", type="primary", key="btn_problems"):
        if _check_input():
            final = _stream_graph("problems", {
                "supervisor":     (10, "Routing..."),
                "scraper":        (25, "Fetching profiles..."),
                "analyzer":       (55, "Identifying weak topics..."),
                "problem_finder": (85, "Searching problems..."),
            })

            if final:
                problems = final.get("problems") or []
                an       = final.get("analysis") or {}

                for e in final.get("errors", []):
                    st.warning(e)

                weak = an.get("weak_topics", [])
                if weak:
                    tags_str = ", ".join(f"`{t['tag']}`" for t in weak[:6])
                    st.info(f"Searched by your weak topics: {tags_str}")

                if not problems:
                    st.info("No unsolved problems found. Try changing difficulty.")
                else:
                    st.success(f"Found **{len(problems)}** unsolved problems for you.")

                    col_f1, col_f2 = st.columns(2)
                    with col_f1:
                        platform_filter = st.multiselect(
                            "Filter by platform",
                            ["codeforces", "cses", "leetcode"],
                            default=["codeforces", "cses", "leetcode"],
                            key="plat_filter",
                        )
                    with col_f2:
                        tag_filter = st.text_input(
                            "Filter by tag (optional)", placeholder="e.g. dp",
                            key="tag_filter",
                        )

                    shown = [
                        p for p in problems
                        if p.get("platform") in platform_filter
                        and (not tag_filter
                             or tag_filter.lower() in " ".join(p.get("tags", [])).lower())
                    ][:prob_count]

                    st.divider()

                    for platform in ["codeforces", "cses", "leetcode"]:
                        plat_probs = [p for p in shown if p.get("platform") == platform]
                        if not plat_probs:
                            continue

                        icon = {"codeforces": "🔵", "cses": "🟢", "leetcode": "🟠"}.get(platform, "⚪")
                        st.subheader(f"{icon} {platform.capitalize()} ({len(plat_probs)})")

                        for p in plat_probs:
                            with st.container():
                                c1, c2, c3 = st.columns([4, 1, 1])
                                with c1:
                                    st.markdown(f"[**{p.get('title','—')}**]({p.get('url','#')})")
                                    tags_str = " · ".join(p.get("tags", [])[:4])
                                    if tags_str:
                                        st.caption(tags_str)
                                with c2:
                                    diff  = p.get("difficulty", "—")
                                    color = {"easy": "green", "medium": "orange",
                                             "hard": "red"}.get(diff.lower(), "gray")
                                    st.markdown(
                                        f"<span style='color:{color};font-weight:600'>"
                                        f"{diff.upper()}</span>",
                                        unsafe_allow_html=True,
                                    )
                                with c3:
                                    if p.get("rating"):
                                        st.caption(f"CF {p['rating']}")
                                    if p.get("relevance"):
                                        st.caption(f"★ {p['relevance']} match")
                            st.divider()


# ════════════════════════════════════════════════════════════════════════════
# TAB 4: PEER COMPARISON
# ════════════════════════════════════════════════════════════════════════════
with tab_compare:
    st.caption(
        "Compare your profile against a friend or rival. "
        "Enter your handles in the sidebar (top) and your peer's handles (Peer Comparison section)."
    )

    if peer_cf or peer_lc:
        st.info(
            f"Comparing **you** ({cf_handle or '—'} / {lc_handle or '—'}) "
            f"vs **{peer_cf or peer_lc}** ({peer_cf or '—'} / {peer_lc or '—'})"
        )
    else:
        st.warning("Enter your peer's Codeforces handle and/or LeetCode username in the sidebar.")

    go_compare = st.button("Run Comparison", type="primary", key="btn_compare")

    if go_compare:
        if not cf_handle and not lc_handle:
            st.warning("Enter your own handles in the sidebar first.")
        elif not peer_cf and not peer_lc:
            st.warning("Enter your peer's handles in the sidebar (Peer Comparison section).")
        else:
            final = _stream_graph(
                "compare",
                {
                    "supervisor":       (8,  "Routing..."),
                    "scraper":          (25, "Fetching your profile..."),
                    "peer_scraper":     (55, "Fetching peer profile..."),
                    "comparison_agent": (85, "Generating comparison..."),
                },
                config=_compare_cfg(),
            )

            if final:
                for e in final.get("errors", []):
                    st.warning(e)

                cmp = final.get("comparison") or {}
                if not cmp:
                    st.error("Comparison failed — check handles and try again.")
                else:
                    import pandas as pd

                    your_handle = cmp.get("your_handle", "You")
                    peer_handle = cmp.get("peer_handle", "Peer")
                    you_cf_s    = cmp["you"]["cf"]
                    you_lc_s    = cmp["you"]["lc"]
                    peer_cf_s   = cmp["peer"]["cf"]
                    peer_lc_s   = cmp["peer"]["lc"]
                    diff        = cmp.get("diff", {})

                    # ── delta helper ──────────────────────────────────────
                    def _delta(val, unit=""):
                        if val > 0:   return f"+{val}{unit} ahead"
                        if val < 0:   return f"{val}{unit} behind"
                        return "tied"

                    # ── head-to-head metrics ──────────────────────────────
                    st.subheader("Head-to-Head")

                    col_you, col_peer = st.columns(2)

                    with col_you:
                        st.markdown(f"### 🔵 {your_handle}")
                        r1, r2, r3 = st.columns(3)
                        r1.metric("CF Rating",
                                  you_cf_s.get("cf_rating", "—"),
                                  delta=_delta(diff.get("cf_rating", 0)))
                        r2.metric("CF Peak",
                                  you_cf_s.get("cf_max_rating", "—"),
                                  delta=_delta(diff.get("cf_max_rating", 0)))
                        r3.metric("CF Contests",
                                  you_cf_s.get("cf_contests", "—"),
                                  delta=_delta(diff.get("cf_contests", 0)))

                        r4, r5, r6 = st.columns(3)
                        # Bug fix: label clarifies this is from last 200 submissions
                        r4.metric("CF Solved \n(recent 200)",
                                  you_cf_s.get("cf_solved", "—"),
                                  delta=_delta(diff.get("cf_solved", 0)),
                                  help="Distinct problems accepted in the last 200 submissions fetched from CF API.")
                        r5.metric("LC Solved",
                                  you_lc_s.get("lc_solved", "—"),
                                  delta=_delta(diff.get("lc_solved", 0)))
                        r6.metric("Consistency",
                                  f"{you_lc_s.get('consistency_score', 0)*100:.0f}%",
                                  delta=_delta(round(diff.get("consistency", 0) * 100), "%"))

                    with col_peer:
                        st.markdown(f"### 🔴 {peer_handle}")
                        r1, r2, r3 = st.columns(3)
                        r1.metric("CF Rating",    peer_cf_s.get("cf_rating", "—"))
                        r2.metric("CF Peak",      peer_cf_s.get("cf_max_rating", "—"))
                        r3.metric("CF Contests",  peer_cf_s.get("cf_contests", "—"))

                        r4, r5, r6 = st.columns(3)
                        r4.metric("CF Solved \n(recent 200)",
                                  peer_cf_s.get("cf_solved", "—"),
                                  help="Distinct problems accepted in the last 200 submissions fetched from CF API.")
                        r5.metric("LC Solved",    peer_lc_s.get("lc_solved", "—"))
                        r6.metric("Consistency",  f"{peer_lc_s.get('consistency_score', 0)*100:.0f}%")

                    st.divider()

                    # ── combined CF rating chart (Bug 3 fix) ─────────────
                    you_cf_raw  = final.get("cf_data")  or {}
                    peer_cf_raw = final.get("cf_data2") or {}

                    you_hist  = you_cf_raw.get("contest_history",  [])
                    peer_hist = peer_cf_raw.get("contest_history", [])

                    if you_hist or peer_hist:
                        st.subheader("CF Rating History")

                        you_ratings  = [c.get("newRating", 0) for c in you_hist]
                        peer_ratings = [c.get("newRating", 0) for c in peer_hist]

                        # Align both series to the same length by padding with NaN
                        max_len = max(len(you_ratings), len(peer_ratings))
                        import math
                        you_padded  = [float("nan")] * (max_len - len(you_ratings))  + you_ratings
                        peer_padded = [float("nan")] * (max_len - len(peer_ratings)) + peer_ratings

                        chart_df = pd.DataFrame({
                            your_handle: you_padded,
                            peer_handle: peer_padded,
                        })
                        st.line_chart(chart_df)
                        st.caption(
                            "Both histories are aligned from their first rated contest. "
                            "Gaps (NaN) appear where one player has more contest history than the other."
                        )

                    st.divider()

                    # ── tag comparison ────────────────────────────────────
                    st.subheader("Tag Analysis (Codeforces)")
                    t1, t2, t3 = st.columns(3)

                    with t1:
                        st.markdown("#### ⚠️ Both Struggle")
                        common = cmp.get("common_weak", [])
                        if common:
                            for t in common:
                                st.markdown(
                                    f"**{t['tag']}**  \n"
                                    f"You: `{t['your_rate']}%` fail · "
                                    f"Peer: `{t['peer_rate']}%` fail"
                                )
                                st.divider()
                        else:
                            st.info("No common weak topics found.")

                    with t2:
                        st.markdown(f"#### ✅ {your_handle}'s Edge")
                        ye = cmp.get("your_edge", [])
                        if ye:
                            for t in ye:
                                st.markdown(
                                    f"**{t['tag']}**  \n"
                                    f"You: `{t['your_rate']}%` · Peer: `{t['peer_rate']}%`  \n"
                                    f"*+{t['advantage']}pp advantage*"
                                )
                                st.divider()
                        else:
                            st.info("No clear advantages found.")

                    with t3:
                        st.markdown(f"#### 🔴 {peer_handle}'s Edge")
                        pe = cmp.get("peer_edge", [])
                        if pe:
                            for t in pe:
                                st.markdown(
                                    f"**{t['tag']}**  \n"
                                    f"You: `{t['your_rate']}%` · Peer: `{t['peer_rate']}%`  \n"
                                    f"*{peer_handle} +{t['advantage']}pp*"
                                )
                                st.divider()
                        else:
                            st.info("No clear peer advantages found.")

                    st.divider()

                    # ── submission quality table + coaching narrative ──────
                    st.subheader("Submission Quality & Coaching")
                    sq1, sq2 = st.columns([1, 2])

                    with sq1:
                        sq_df = pd.DataFrame({
                            "Metric":      ["WA Rate", "TLE Rate", "Avg CF Δ/contest",
                                           "LC Contest Rating"],
                            your_handle:   [
                                f"{you_cf_s.get('wa_rate', 0)*100:.1f}%",
                                f"{you_cf_s.get('tle_rate', 0)*100:.1f}%",
                                f"{you_cf_s.get('avg_rating_change', 0):+.1f}",
                                f"{you_lc_s.get('lc_contest_rating', 0):.0f}",
                            ],
                            peer_handle: [
                                f"{peer_cf_s.get('wa_rate', 0)*100:.1f}%",
                                f"{peer_cf_s.get('tle_rate', 0)*100:.1f}%",
                                f"{peer_cf_s.get('avg_rating_change', 0):+.1f}",
                                f"{peer_lc_s.get('lc_contest_rating', 0):.0f}",
                            ],
                        })
                        st.dataframe(sq_df, use_container_width=True, hide_index=True)

                    with sq2:
                        st.markdown("**Coaching Analysis**")
                        narrative = cmp.get("narrative", "")
                        if narrative:
                            ph = st.empty()
                            displayed = ""
                            for i, word in enumerate(narrative.split(" ")):
                                displayed += word + " "
                                if i % 40 == 0:
                                    ph.markdown(displayed + "▌")
                                    time.sleep(0.01)
                            ph.markdown(displayed)
                        else:
                            st.info("No narrative generated.")