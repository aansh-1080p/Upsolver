"""
tools/codeforces_tools.py
--------------------------
Async functions that hit the Codeforces public API.
No API key required. All endpoints are public.

CF API docs: https://codeforces.com/apiHelp
"""

import os
import httpx
import asyncio
from typing import Any
from dotenv import load_dotenv

load_dotenv()

CF_API_BASE = os.getenv("CF_API_BASE", "https://codeforces.com/api")

# Generous timeout — CF API can be slow
_TIMEOUT = httpx.Timeout(30.0, connect=10.0)


async def _get(client: httpx.AsyncClient, endpoint: str, params: dict) -> dict:
    """Make a single GET call to CF API. Raises on non-OK status or API error."""
    url = f"{CF_API_BASE}/{endpoint}"
    resp = await client.get(url, params=params, timeout=_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()
    if data.get("status") != "OK":
        comment = data.get("comment", "Unknown CF API error")
        raise ValueError(f"Codeforces API error: {comment}")
    return data["result"]


async def fetch_cf_user_info(handle: str) -> dict:
    """
    Fetch basic profile info for a CF handle.
    Returns rating, maxRating, rank, maxRank, contribution, friendOfCount.
    """
    async with httpx.AsyncClient() as client:
        try:
            result = await _get(client, "user.info", {"handles": handle})
            user = result[0]
            return {
                "handle": user.get("handle", handle),
                "rating": user.get("rating", 0),
                "max_rating": user.get("maxRating", 0),
                "rank": user.get("rank", "unrated"),
                "max_rank": user.get("maxRank", "unrated"),
                "contribution": user.get("contribution", 0),
                "friends_of_count": user.get("friendOfCount", 0),
            }
        except Exception as e:
            return {
                "handle": handle,
                "rating": 0,
                "max_rating": 0,
                "rank": "unrated",
                "max_rank": "unrated",
                "contribution": 0,
                "friends_of_count": 0,
                "error": str(e),
            }


async def fetch_cf_rating_history(handle: str) -> list[dict]:
    """
    Fetch full contest rating history for a CF handle.
    Returns list of {contestId, contestName, rank, oldRating, newRating, ratingChange}.
    """
    async with httpx.AsyncClient() as client:
        try:
            result = await _get(client, "user.rating", {"handle": handle})
            contests = []
            for entry in result:
                contests.append({
                    "contestId": entry.get("contestId"),
                    "contestName": entry.get("contestName", ""),
                    "rank": entry.get("rank", 0),
                    "oldRating": entry.get("oldRating", 0),
                    "newRating": entry.get("newRating", 0),
                    "ratingChange": entry.get("newRating", 0) - entry.get("oldRating", 0),
                    "ratingUpdateTimeSeconds": entry.get("ratingUpdateTimeSeconds", 0),
                })
            return contests
        except Exception as e:
            return [{"error": str(e)}]


async def fetch_cf_submissions(handle: str, count: int = 200) -> list[dict]:
    """
    Fetch last `count` submissions for a CF handle.
    Returns list of submissions with verdict, tags, timestamp, language.
    """
    async with httpx.AsyncClient() as client:
        try:
            result = await _get(client, "user.status", {
                "handle": handle,
                "from": 1,
                "count": count,
            })
            submissions = []
            for sub in result:
                problem = sub.get("problem", {})
                submissions.append({
                    "id": sub.get("id"),
                    "problem_name": problem.get("name", ""),
                    "problem_index": problem.get("index", ""),
                    "problem_rating": problem.get("rating", 0),
                    "problem_tags": problem.get("tags", []),
                    "verdict": sub.get("verdict", "UNKNOWN"),
                    "timestamp": sub.get("creationTimeSeconds", 0),
                    "programming_language": sub.get("programmingLanguage", ""),
                    "time_consumed_millis": sub.get("timeConsumedMillis", 0),
                    "memory_consumed_bytes": sub.get("memoryConsumedBytes", 0),
                    "contest_id": sub.get("contestId"),
                })
            return submissions
        except Exception as e:
            return [{"error": str(e)}]


async def fetch_cf_contest_list(handle: str) -> list[dict]:
    """
    Fetch list of contests the user participated in with final standings.
    Uses user.rating which gives all rated contest entries.
    """
    # user.rating already gives contest history — reuse it
    return await fetch_cf_rating_history(handle)


async def fetch_all_cf_data(handle: str) -> dict:
    """
    Master function: fetch all CF data for a handle concurrently.
    Returns a combined dict matching CFData TypedDict structure.
    """
    user_info_task = fetch_cf_user_info(handle)
    rating_history_task = fetch_cf_rating_history(handle)
    submissions_task = fetch_cf_submissions(handle, count=200)

    user_info, rating_history, submissions = await asyncio.gather(
        user_info_task,
        rating_history_task,
        submissions_task,
    )

    # Count distinct solved problems (verdict OK, unique problem name)
    seen = set()
    solved_count = 0
    for sub in submissions:
        if sub.get("verdict") == "OK":
            key = sub.get("problem_name", "")
            if key and key not in seen:
                seen.add(key)
                solved_count += 1

    return {
        "handle": user_info.get("handle", handle),
        "rating": user_info.get("rating", 0),
        "max_rating": user_info.get("max_rating", 0),
        "rank": user_info.get("rank", "unrated"),
        "max_rank": user_info.get("max_rank", "unrated"),
        "contribution": user_info.get("contribution", 0),
        "friends_of_count": user_info.get("friends_of_count", 0),
        "contest_history": rating_history,
        "submissions": submissions,
        "solved_count": solved_count,
        "fetch_errors": [
            sub.get("error") for sub in submissions if "error" in sub
        ] + (
            [user_info.get("error")] if "error" in user_info else []
        ),
    }


async def fetch_cf_contests() -> list:
    """Fetch upcoming, live, and recent Codeforces contests."""
    async with httpx.AsyncClient() as client:
        try:
            res = await _get(client, "contest.list", {"gym": False})
            return res or []
        except Exception:
            return []


async def fetch_cf_contest_standings(contest_id: int, handles: list) -> list:
    """Fetch participant standings for specified handles in a contest."""
    if not handles or not contest_id:
        return []
    async with httpx.AsyncClient() as client:
        try:
            handles_str = ";".join([h.strip() for h in handles if h and h.strip()])
            if not handles_str:
                return []
            res = await _get(client, "contest.standings", {
                "contestId": contest_id,
                "handles": handles_str,
                "showUnofficial": True
            })
            return res.get("rows", [])
        except Exception:
            return []

