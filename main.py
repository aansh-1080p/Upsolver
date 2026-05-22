"""
main.py — CLI entry point for CP-Agent (complete Week 4).

Usage:
    python main.py --cf <handle> --lc <username>
    python main.py --cf tourist  --lc neal_wu --intent plan
    python main.py --cf tourist  --lc neal_wu --intent problems
    python main.py --cf tourist  --lc neal_wu --intent all
    python main.py --cf tourist  --lc neal_wu --no-cache
"""

import argparse
import sys
from dotenv import load_dotenv
load_dotenv()


def _print_plan(plan: dict):
    if not plan:
        return
    print(f"\n  Goal: {plan.get('goal', '—')}")
    for w in plan.get("weeks", []):
        print(f"\n  Week {w.get('week')} — {w.get('topic')}")
        for s in w.get("subtopics", []):
            print(f"    • {s}")
        for r in w.get("resources", []):
            print(f"    → {r.get('name')}: {r.get('url')}")
        print(f"    Problems/day: {w.get('problems_per_day', 3)}")


def _print_problems(problems: list):
    if not problems:
        print("  No problems found.")
        return
    print(f"\n  Found {len(problems)} unsolved problems:\n")
    for i, p in enumerate(problems, 1):
        diff   = p.get("difficulty", "").upper()
        rating = f" [{p.get('rating')}]" if p.get("rating") else ""
        rel    = f" ★{p.get('relevance')}" if p.get("relevance") else ""
        tags   = ", ".join(p.get("tags", [])[:3])
        print(f"  {i:2}. [{p.get('platform','?').upper():11}] {p.get('title','—')}")
        print(f"       {diff}{rating}{rel}  |  {tags}")
        print(f"       {p.get('url','')}")


def main():
    ap = argparse.ArgumentParser(description="CP-Agent CLI")
    ap.add_argument("--cf",         default="", help="Codeforces handle")
    ap.add_argument("--lc",         default="", help="LeetCode username")
    ap.add_argument("--intent",     default="report",
                    choices=["report", "plan", "problems", "all"])
    ap.add_argument("--goal",       default="Improve my competitive programming skills")
    ap.add_argument("--weeks",      type=int, default=4)
    ap.add_argument("--hours",      type=int, default=2)
    ap.add_argument("--difficulty", default="medium",
                    choices=["easy", "medium", "hard"])
    ap.add_argument("--no-cache",   action="store_true")
    args = ap.parse_args()

    if not args.cf and not args.lc:
        print("Error: provide --cf and/or --lc")
        sys.exit(1)

    from graph.graph_builder import build_graph, make_config

    graph  = build_graph(use_checkpointing=not args.no_cache)
    config = make_config(args.cf, args.lc)

    initial = {
        "cf_username":     args.cf,
        "lc_username":     args.lc,
        "cf_data":         None,
        "lc_data":         None,
        "analysis":        None,
        "plan":            None,
        "problems":        None,
        "report_markdown": None,
        "report_pdf_path": None,
        "user_prefs": {
            "goal":                args.goal,
            "hours_per_day":       args.hours,
            "duration_weeks":      args.weeks,
            "preferred_resources": [],
            "target_rating":       None,
            "problem_difficulty":  args.difficulty,
        },
        "errors":   [],
        "messages": [],
        "intent":   args.intent,
    }

    print(f"\nCP-Agent — intent={args.intent}  CF={args.cf or '—'}  LC={args.lc or '—'}\n")

    # Stream until interrupt or END
    interrupted = False
    try:
        for event in graph.stream(initial, config=config, stream_mode="updates"):
            node = list(event.keys())[0]
            print(f"  ✓ {node}")
    except Exception:
        interrupted = True

    # Handle HITL auto-approve for plan intent
    if interrupted and args.intent in ("plan", "all"):
        print("\n[CLI] HITL pause — auto-approving plan (use UI for interactive review)...")
        snap = graph.get_state(config)
        plan = snap.values.get("plan") or {}
        graph.update_state(
            config,
            {"plan": {**plan, "status": "approved", "user_feedback": ""}},
            as_node="hitl",
        )
        try:
            for event in graph.stream(None, config=config, stream_mode="updates"):
                node = list(event.keys())[0]
                print(f"  ✓ {node} (resumed)")
        except Exception:
            pass

    # Final output
    final = graph.get_state(config).values

    report = final.get("report_markdown", "")
    if report:
        print("\n" + "=" * 60)
        print(report[:2000])
        if len(report) > 2000:
            print(f"  ... ({len(report) - 2000} more chars — see PDF)")
        print("=" * 60)
        pdf = final.get("report_pdf_path")
        if pdf:
            print(f"  PDF → {pdf}")

    plan = final.get("plan")
    if plan and plan.get("weeks"):
        print("\n" + "=" * 60)
        print("STUDY PLAN")
        print("=" * 60)
        _print_plan(plan)

    problems = final.get("problems")
    if problems is not None:
        print("\n" + "=" * 60)
        print("PRACTICE PROBLEMS")
        print("=" * 60)
        _print_problems(problems)

    errs = final.get("errors", [])
    if errs:
        print(f"\nWarnings ({len(errs)}):")
        for e in errs:
            print(f"  {e}")


if __name__ == "__main__":
    main()
