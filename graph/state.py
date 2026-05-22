"""
graph/state.py
--------------
Shared AgentState TypedDict for Upsolvers.

v2: Added peer comparison fields:
  - cf_username2, lc_username2  → peer's handles
  - cf_data2, lc_data2          → peer's scraped data
  - comparison                  → comparison analysis result
"""

from typing import Annotated, Optional, TypedDict
from langgraph.graph.message import add_messages


class CFContest(TypedDict):
    contestId: int
    contestName: str
    rank: int
    oldRating: int
    newRating: int
    ratingChange: int


class CFSubmission(TypedDict):
    id: int
    problem_name: str
    problem_tags: list[str]
    verdict: str
    timestamp: int
    programming_language: str


class CFData(TypedDict):
    handle: str
    rating: int
    max_rating: int
    rank: str
    contest_history: list[CFContest]
    submissions: list[CFSubmission]
    solved_count: int
    friends_of_count: int


class LCContestEntry(TypedDict):
    contestName: str
    rating: float
    ranking: int
    problemsSolved: int
    totalProblems: int
    attended: bool


class LCSubmission(TypedDict):
    title: str
    titleSlug: str
    timestamp: str
    statusDisplay: str
    lang: str


class LCSkillTag(TypedDict):
    tagName: str
    tagSlug: str
    problemsSolved: int


class LCData(TypedDict):
    username: str
    ranking: int
    total_solved: int
    easy_solved: int
    medium_solved: int
    hard_solved: int
    contest_rating: float
    contest_attended: int
    contest_history: list[LCContestEntry]
    recent_submissions: list[LCSubmission]
    skill_tags_advanced: list[LCSkillTag]
    skill_tags_intermediate: list[LCSkillTag]
    skill_tags_fundamental: list[LCSkillTag]
    submission_calendar: dict[str, int]


class WeakTopic(TypedDict):
    tag: str
    platform: str
    attempts: int
    failures: int
    failure_rate: float


class Analysis(TypedDict):
    weak_topics: list[WeakTopic]
    strong_topics: list[dict]
    consistency_score: float
    avg_rating_change: float
    best_contest_rank: int
    worst_contest_rank: int
    peak_solving_hour: int
    wa_rate: float
    tle_rate: float
    narrative: str


class UserPrefs(TypedDict):
    goal: str
    hours_per_day: int
    target_rating: Optional[int]
    duration_weeks: int
    preferred_resources: list[str]


class AgentState(TypedDict):
    # ── Primary user ──────────────────────────────────────────────────────────
    cf_username: str
    lc_username: str
    intent: str                        # "report"|"plan"|"problems"|"all"|"compare"

    cf_data:  Optional[CFData]
    lc_data:  Optional[LCData]
    analysis: Optional[Analysis]

    # ── Peer / comparison ─────────────────────────────────────────────────────
    cf_username2: str                  # peer's Codeforces handle
    lc_username2: str                  # peer's LeetCode username
    cf_data2: Optional[CFData]         # peer's scraped CF data
    lc_data2: Optional[LCData]         # peer's scraped LC data
    comparison: Optional[dict]         # output of comparison_agent

    # ── Other outputs ─────────────────────────────────────────────────────────
    plan: Optional[dict]
    problems: Optional[list[dict]]
    report_markdown: Optional[str]
    report_pdf_path: Optional[str]

    # ── Preferences / infra ───────────────────────────────────────────────────
    user_prefs:  Optional[UserPrefs]
    errors:      list[str]
    messages:    Annotated[list, add_messages]