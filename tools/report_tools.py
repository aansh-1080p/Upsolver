"""
agents/report_generator.py
---------------------------
Week 2 — LangGraph node that builds a Markdown report
from state["analysis"] + raw data, then exports to PDF.

Kept simple: pure f-string Markdown template, WeasyPrint for PDF.
Streaming happens in the Streamlit frontend via astream_events().
"""

import os
from datetime import datetime, timezone
from pathlib import Path

from graph.state import AgentState

OUTPUT_DIR = Path("./output/reports")


# ── Markdown builder ──────────────────────────────────────────────────────────

def _build_markdown(state: AgentState) -> str:
    cf      = state.get("cf_data")   or {}
    lc      = state.get("lc_data")   or {}
    an      = state.get("analysis")  or {}
    cf_s    = an.get("_cf", {})
    lc_s    = an.get("_lc", {})
    now_str = datetime.now(tz=timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    cf_handle  = cf.get("handle", "—")
    lc_handle  = lc.get("username", "—")

    # ── header ────────────────────────────────────────────────────────────────
    lines = [
        f"# CP Performance Report",
        f"",
        f"**Generated:** {now_str}  ",
        f"**Codeforces:** {cf_handle}  ",
        f"**LeetCode:** {lc_handle}",
        f"",
        f"---",
        f"",
    ]

    # ── executive summary (Gemini narrative) ──────────────────────────────────
    lines += [
        f"## Summary",
        f"",
        an.get("narrative", "_No narrative generated._"),
        f"",
        f"---",
        f"",
    ]

    # ── key metrics ───────────────────────────────────────────────────────────
    lines += [
        f"## Key Metrics",
        f"",
        f"| Metric | Value |",
        f"|--------|-------|",
        f"| CF Rating | {cf.get('rating', 0)} (peak {cf.get('max_rating', 0)}) |",
        f"| CF Rank | {cf.get('rank', '—')} |",
        f"| CF Problems Solved | {cf.get('solved_count', 0)} |",
        f"| CF Contests | {cf_s.get('cf_contests', 0)} |",
        f"| Avg Rating Change | {cf_s.get('avg_rating_change', 0):+.1f} per contest |",
        f"| Best Contest Rank | {an.get('best_contest_rank', '—')} |",
        f"| WA Rate | {an.get('wa_rate', 0)*100:.1f}% |",
        f"| TLE Rate | {an.get('tle_rate', 0)*100:.1f}% |",
        f"| LC Solved | {lc.get('total_solved', 0)} (E{lc.get('easy_solved',0)} M{lc.get('medium_solved',0)} H{lc.get('hard_solved',0)}) |",
        f"| LC Contest Rating | {lc.get('contest_rating', 0):.0f} |",
        f"| Consistency (90d) | {an.get('consistency_score', 0)*100:.0f}% |",
        f"| Peak Solving Hour | {an.get('peak_solving_hour', 0):02d}:00 UTC |",
        f"",
        f"---",
        f"",
    ]

    # ── CF contest history (last 10) ──────────────────────────────────────────
    contests = cf.get("contest_history", [])
    if contests:
        recent = contests[-10:][::-1]   # last 10, newest first
        lines += [
            f"## Recent Codeforces Contests (last {len(recent)})",
            f"",
            f"| Contest | Rank | Old → New | Change |",
            f"|---------|------|-----------|--------|",
        ]
        for c in recent:
            name   = c.get("contestName", "")[:45]
            rank   = c.get("rank", "—")
            old_r  = c.get("oldRating", 0)
            new_r  = c.get("newRating", 0)
            change = c.get("ratingChange", new_r - old_r)
            sign   = "+" if change >= 0 else ""
            lines.append(f"| {name} | {rank} | {old_r} → {new_r} | {sign}{change} |")
        lines += ["", "---", ""]

    # ── weak topics ───────────────────────────────────────────────────────────
    weak = an.get("weak_topics", [])
    if weak:
        lines += [
            f"## Weak Topics",
            f"",
            f"| Topic | Platform | Failure Rate |",
            f"|-------|----------|-------------|",
        ]
        for t in weak:
            fr = f"{t.get('failure_rate', 0)*100:.0f}%" if t.get("failure_rate") else "low solve count"
            lines.append(f"| {t['tag']} | {t['platform']} | {fr} |")
        lines += ["", "---", ""]

    # ── strong topics ─────────────────────────────────────────────────────────
    strong = an.get("strong_topics", [])
    if strong:
        lines += [
            f"## Strong Topics",
            f"",
            f"| Topic | Platform |",
            f"|-------|----------|",
        ]
        for t in strong:
            lines.append(f"| {t['tag']} | {t['platform']} |")
        lines += ["", "---", ""]

    # ── LC skill tags ─────────────────────────────────────────────────────────
    adv = lc.get("skill_tags_advanced", [])
    if adv:
        top_adv = sorted(adv, key=lambda x: x.get("problemsSolved", 0), reverse=True)[:8]
        lines += [
            f"## LeetCode Advanced Tags",
            f"",
            f"| Tag | Problems Solved |",
            f"|-----|----------------|",
        ]
        for t in top_adv:
            lines.append(f"| {t.get('tagName','—')} | {t.get('problemsSolved', 0)} |")
        lines += ["", "---", ""]

    # ── footer ────────────────────────────────────────────────────────────────
    lines += [
        f"_Report generated by CP-Agent · LangGraph + Gemini 2.0 Flash_",
    ]

    return "\n".join(lines)


# ── PDF export ────────────────────────────────────────────────────────────────

def _markdown_to_pdf(markdown_text: str, out_path: Path) -> bool:
    """Convert markdown → HTML → PDF using WeasyPrint. Returns True on success."""
    try:
        import markdown as md_lib
        from weasyprint import HTML

        html_body = md_lib.markdown(markdown_text, extensions=["tables"])
        html = f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {{ font-family: Arial, sans-serif; font-size: 13px;
          line-height: 1.6; margin: 40px; color: #222; }}
  h1   {{ font-size: 22px; border-bottom: 2px solid #333; padding-bottom: 6px; }}
  h2   {{ font-size: 16px; margin-top: 24px; color: #333; }}
  table{{ border-collapse: collapse; width: 100%; margin: 12px 0; }}
  th,td{{ border: 1px solid #ccc; padding: 6px 10px; text-align: left; }}
  th   {{ background: #f0f0f0; }}
  hr   {{ border: none; border-top: 1px solid #ddd; margin: 16px 0; }}
  code {{ background: #f4f4f4; padding: 2px 4px; border-radius: 3px; }}
</style>
</head>
<body>{html_body}</body>
</html>"""
        HTML(string=html).write_pdf(str(out_path))
        return True
    except Exception as e:
        print(f"[Report] PDF export failed: {e}")
        return False


# ── LangGraph node ────────────────────────────────────────────────────────────

def report_generator_node(state: AgentState) -> dict:
    """
    LangGraph node — builds Markdown report from state,
    saves it, and optionally exports PDF.
    """
    errors = list(state.get("errors") or [])

    if not state.get("analysis"):
        errors.append("[Report] No analysis in state — skipping report.")
        return {"report_markdown": None, "report_pdf_path": None, "errors": errors}

    print("[Report] Building Markdown report...")
    markdown = _build_markdown(state)

    # Save markdown
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    cf_handle = (state.get("cf_data") or {}).get("handle", "unknown")
    lc_handle = (state.get("lc_data") or {}).get("username", "unknown")
    date_str  = datetime.now().strftime("%Y%m%d_%H%M")
    stem      = f"{cf_handle}_{lc_handle}_{date_str}"

    md_path  = OUTPUT_DIR / f"{stem}.md"
    pdf_path = OUTPUT_DIR / f"{stem}.pdf"

    md_path.write_text(markdown, encoding="utf-8")
    print(f"[Report] Markdown saved → {md_path}")

    # PDF
    pdf_ok = _markdown_to_pdf(markdown, pdf_path)
    pdf_result = str(pdf_path) if pdf_ok else None
    if pdf_ok:
        print(f"[Report] PDF saved → {pdf_path}")

    return {
        "report_markdown": markdown,
        "report_pdf_path": pdf_result,
        "errors":          errors,
    }
