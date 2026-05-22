"""
tools/leetcode_tools.py
------------------------
Async functions that fetch LeetCode user data via GraphQL ONLY.

alfa-leetcode-api (Docker) has been removed — GraphQL works reliably
for all profile data and is simpler to maintain (no Docker dependency).

All five data points are fetched concurrently via asyncio.gather with
return_exceptions=True so one endpoint failing never blocks the rest.
"""

import json
import asyncio
import httpx

LC_GRAPHQL_URL = "https://leetcode.com/graphql"
_TIMEOUT       = httpx.Timeout(30.0, connect=10.0)
_HEADERS       = {
    "Content-Type": "application/json",
    "Referer":      "https://leetcode.com",
    "User-Agent":   "Mozilla/5.0 (compatible; cp-agent/1.0)",
}


# ── low-level GraphQL helper ──────────────────────────────────────────────────

async def _gql(client: httpx.AsyncClient, query: str, variables: dict):
    """POST a GraphQL query. Returns data dict or None on any failure."""
    try:
        r = await client.post(
            LC_GRAPHQL_URL,
            json={"query": query, "variables": variables},
            headers=_HEADERS,
            timeout=_TIMEOUT,
        )
        if r.status_code == 200:
            return r.json().get("data")
        return None
    except Exception:
        return None


def _safe_calendar(raw) -> dict:
    if isinstance(raw, dict):
        return raw
    if isinstance(raw, str):
        try:
            return json.loads(raw)
        except Exception:
            return {}
    return {}


# ── individual fetchers ───────────────────────────────────────────────────────

async def fetch_lc_profile(username: str, client: httpx.AsyncClient) -> dict:
    """Fetch ranking + solved counts by difficulty."""
    q = """
    query getUserProfile($username: String!) {
      matchedUser(username: $username) {
        profile { ranking }
        submitStats {
          acSubmissionNum { difficulty count }
        }
      }
    }
    """
    data = await _gql(client, q, {"username": username})
    if data and data.get("matchedUser"):
        mu = data["matchedUser"]
        ac = {d["difficulty"]: d["count"] for d in mu["submitStats"]["acSubmissionNum"]}
        return {
            "username":      username,
            "ranking":       mu["profile"].get("ranking", 0),
            "total_solved":  ac.get("All", 0),
            "easy_solved":   ac.get("Easy", 0),
            "medium_solved": ac.get("Medium", 0),
            "hard_solved":   ac.get("Hard", 0),
        }
    return {
        "username": username, "ranking": 0,
        "total_solved": 0, "easy_solved": 0, "medium_solved": 0, "hard_solved": 0,
        "error": "Profile unavailable",
    }


async def fetch_lc_contest(username: str, client: httpx.AsyncClient) -> dict:
    """Fetch contest rating + history."""
    q = """
    query getUserContestRanking($username: String!) {
      userContestRanking(username: $username) {
        rating attendedContestsCount globalRanking topPercentage
      }
      userContestRankingHistory(username: $username) {
        attended rating ranking problemsSolved totalProblems
        contest { title }
      }
    }
    """
    data = await _gql(client, q, {"username": username})
    if data:
        cr = data.get("userContestRanking") or {}
        ch = data.get("userContestRankingHistory") or []
        hist = [
            {
                "contestName":    e.get("contest", {}).get("title", ""),
                "rating":         e.get("rating", 0),
                "ranking":        e.get("ranking", 0),
                "problemsSolved": e.get("problemsSolved", 0),
                "totalProblems":  e.get("totalProblems", 0),
                "attended":       e.get("attended", False),
            }
            for e in ch
        ]
        return {
            "contest_rating":   float(cr.get("rating", 0) or 0),
            "contest_attended": int(cr.get("attendedContestsCount", 0) or 0),
            "global_ranking":   int(cr.get("globalRanking", 0) or 0),
            "top_percentage":   float(cr.get("topPercentage", 100) or 100),
            "contest_history":  hist,
        }
    return {
        "contest_rating": 0.0, "contest_attended": 0,
        "global_ranking": 0,   "top_percentage": 100.0,
        "contest_history": [], "error": "Contest data unavailable",
    }


async def fetch_lc_submissions(username: str, client: httpx.AsyncClient, limit: int = 50) -> list:
    """Fetch recent accepted submissions."""
    q = """
    query recentAcSubmissions($username: String!, $limit: Int!) {
      recentAcSubmissionList(username: $username, limit: $limit) {
        id title titleSlug timestamp statusDisplay lang
      }
    }
    """
    data = await _gql(client, q, {"username": username, "limit": limit})
    if data and "recentAcSubmissionList" in data:
        return data["recentAcSubmissionList"] or []
    return []


async def fetch_lc_skills(username: str, client: httpx.AsyncClient) -> dict:
    """Fetch skill stats: problems solved per topic tag."""
    q = """
    query skillStats($username: String!) {
      matchedUser(username: $username) {
        tagProblemCounts {
          advanced     { tagName tagSlug problemsSolved }
          intermediate { tagName tagSlug problemsSolved }
          fundamental  { tagName tagSlug problemsSolved }
        }
      }
    }
    """
    data = await _gql(client, q, {"username": username})
    if data and data.get("matchedUser"):
        tpc = data["matchedUser"].get("tagProblemCounts") or {}
        return {
            "advanced":     tpc.get("advanced", []),
            "intermediate": tpc.get("intermediate", []),
            "fundamental":  tpc.get("fundamental", []),
        }
    return {"advanced": [], "intermediate": [], "fundamental": []}


async def fetch_lc_calendar(username: str, client: httpx.AsyncClient) -> dict:
    """Fetch submission calendar heatmap."""
    q = """
    query userProfileCalendar($username: String!) {
      matchedUser(username: $username) {
        userCalendar { submissionCalendar }
      }
    }
    """
    data = await _gql(client, q, {"username": username})
    if data and data.get("matchedUser"):
        raw = data["matchedUser"].get("userCalendar", {}).get("submissionCalendar", "{}")
        return _safe_calendar(raw)
    return {}


# ── master fetcher ────────────────────────────────────────────────────────────

async def fetch_all_lc_data(username: str) -> dict:
    """
    Fetch all LeetCode data concurrently via GraphQL.
    Returns a dict matching the LCData TypedDict structure.
    """
    _defaults = {
        "profile":  {"username": username, "ranking": 0, "total_solved": 0,
                     "easy_solved": 0, "medium_solved": 0, "hard_solved": 0},
        "contest":  {"contest_rating": 0.0, "contest_attended": 0,
                     "global_ranking": 0, "top_percentage": 100.0, "contest_history": []},
        "subs":     [],
        "skills":   {"advanced": [], "intermediate": [], "fundamental": []},
        "calendar": {},
    }

    async with httpx.AsyncClient() as client:
        results = await asyncio.gather(
            fetch_lc_profile(username, client),
            fetch_lc_contest(username, client),
            fetch_lc_submissions(username, client, limit=50),
            fetch_lc_skills(username, client),
            fetch_lc_calendar(username, client),
            return_exceptions=True,
        )

    keys    = ["profile", "contest", "subs", "skills", "calendar"]
    fetched = {}
    errors  = []

    for key, result in zip(keys, results):
        if isinstance(result, Exception):
            errors.append(f"LC {key}: {result}")
            fetched[key] = _defaults[key]
        else:
            fetched[key] = result
            if isinstance(result, dict) and "error" in result:
                errors.append(f"LC {key}: {result['error']}")

    p = fetched["profile"]
    c = fetched["contest"]
    s = fetched["skills"]

    return {
        "username":                p.get("username", username),
        "ranking":                 p.get("ranking", 0),
        "total_solved":            p.get("total_solved", 0),
        "easy_solved":             p.get("easy_solved", 0),
        "medium_solved":           p.get("medium_solved", 0),
        "hard_solved":             p.get("hard_solved", 0),
        "contest_rating":          c.get("contest_rating", 0.0),
        "contest_attended":        c.get("contest_attended", 0),
        "contest_global_ranking":  c.get("global_ranking", 0),
        "contest_top_percentage":  c.get("top_percentage", 100.0),
        "contest_history":         c.get("contest_history", []),
        "recent_submissions":      fetched["subs"] if isinstance(fetched["subs"], list) else [],
        "skill_tags_advanced":     s.get("advanced", []),
        "skill_tags_intermediate": s.get("intermediate", []),
        "skill_tags_fundamental":  s.get("fundamental", []),
        "submission_calendar":     fetched["calendar"] if isinstance(fetched["calendar"], dict) else {},
        "fetch_errors":            errors,
    }