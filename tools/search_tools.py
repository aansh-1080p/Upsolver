"""
tools/search_tools.py
----------------------
Practice problem fetchers for three platforms.

ROOT CAUSE of "only CF problems" bug — fixed here:

1. CF tag normalization: CF tags like "dfs and similar", "dsu", "sortings",
   "shortest paths" need to be mapped to LC slugs AND CSES tags before
   querying. The old code passed CF-format tags directly, which don't match
   any valid LC slug or CSES tag.

2. LC GraphQL query: The old `questionList` query with nested `filters.tags`
   is unreliable. Fixed to use the correct working query structure:
   `questionList(categorySlug, limit, skip, filters)` returning `data { ... }`.

3. CSES tag matching: CSES problems are tagged with generic terms ("graphs",
   "dp"). CF tags ("dfs and similar", "dsu") must be normalized to these
   generic terms before CSES matching.

Fix strategy:
  - _normalize_tags(): converts any tag format to a canonical set used by
    both CSES matching and LC slug lookup.
  - _CF_TO_CANONICAL: maps CF-specific tag names → canonical names.
  - _CANONICAL_TO_LC_SLUG: maps canonical names → LC topic tag slugs.
  - CSES problems are tagged with canonical names so they always match.
"""

import asyncio
import httpx

_TIMEOUT = httpx.Timeout(20.0, connect=8.0)
_LC_GQL  = "https://leetcode.com/graphql"
_LC_HDR  = {
    "Content-Type": "application/json",
    "Referer":      "https://leetcode.com",
    "User-Agent":   "Mozilla/5.0 (compatible; cp-agent/1.0)",
}


# ── Tag normalization ─────────────────────────────────────────────────────────
#
# CF uses very specific tag names. We normalize them to "canonical" names
# that both CSES (static list) and LC (slug lookup) understand.

_CF_TO_CANONICAL: dict[str, str] = {
    # CF-specific → canonical
    "dfs and similar":          "graphs",
    "dsu":                      "union find",
    "sortings":                 "sorting",
    "two pointers":             "two pointers",
    "shortest paths":           "shortest path",
    "data structures":          "data structures",
    "number theory":            "number theory",
    "combinatorics":            "combinatorics",
    "bitmasks":                 "bit manipulation",
    "brute force":              "brute force",
    "divide and conquer":       "divide and conquer",
    "meet-in-the-middle":       "divide and conquer",
    "implementation":           "simulation",
    "constructive algorithms":  "greedy",
    "ternary search":           "binary search",
    "schedules":                "greedy",
    "games":                    "game theory",
    "game theory":              "game theory",
    "hashing":                  "hashing",
    "fft":                      "math",
    "expression parsing":       "strings",
    "probabilities":            "math",
    "flows":                    "graphs",
    "2-sat":                    "graphs",
    "chinese remainder theorem":"math",
    "matrices":                 "matrix",
    "geometry":                 "geometry",
    # Already canonical — pass through
    "dp":                       "dp",
    "dynamic programming":      "dp",
    "graphs":                   "graphs",
    "trees":                    "trees",
    "strings":                  "strings",
    "greedy":                   "greedy",
    "math":                     "math",
    "sorting":                  "sorting",
    "binary search":            "binary search",
    "segment tree":             "segment tree",
    "hashing":                  "hashing",
    "backtracking":             "backtracking",
    "recursion":                "recursion",
    "stack":                    "stack",
    "queue":                    "queue",
    "heap":                     "heap",
    "linked list":              "linked list",
    "bit manipulation":         "bit manipulation",
    "union find":               "union find",
    "trie":                     "trie",
    "matrix":                   "matrix",
    "prefix sum":               "prefix sum",
    "sliding window":           "sliding window",
}

# canonical name → LC topic tag slug (used in GraphQL query)
_CANONICAL_TO_LC_SLUG: dict[str, str] = {
    "dp":               "dynamic-programming",
    "graphs":           "graph",
    "trees":            "tree",
    "strings":          "string",
    "greedy":           "greedy",
    "math":             "math",
    "sorting":          "sorting",
    "binary search":    "binary-search",
    "two pointers":     "two-pointers",
    "segment tree":     "segment-tree",
    "hashing":          "hash-table",
    "backtracking":     "backtracking",
    "recursion":        "recursion",
    "stack":            "stack",
    "queue":            "queue",
    "heap":             "heap-priority-queue",
    "linked list":      "linked-list",
    "bit manipulation": "bit-manipulation",
    "union find":       "union-find",
    "trie":             "trie",
    "matrix":           "matrix",
    "prefix sum":       "prefix-sum",
    "sliding window":   "sliding-window",
    "divide and conquer":"divide-and-conquer",
    "shortest path":    "shortest-path",
    "simulation":       "simulation",
    "game theory":      "game-theory",
    "brute force":      "enumeration",
    "number theory":    "number-theory",
    "combinatorics":    "combinatorics",
    "geometry":         "geometry",
    "data structures":  "data-stream",
    "array":            "array",
}


def _normalize_tags(tags: list[str]) -> list[str]:
    """
    Convert any mix of CF-style, LC-style, or CSES-style tags
    to a deduplicated list of canonical names.
    """
    canonical = set()
    for t in tags:
        t_lower = t.lower().strip()
        if t_lower in _CF_TO_CANONICAL:
            canonical.add(_CF_TO_CANONICAL[t_lower])
        else:
            canonical.add(t_lower)
    return list(canonical)


def _canonical_to_lc_slugs(canonical_tags: list[str]) -> list[str]:
    """Convert canonical tag names to LC slug strings."""
    slugs = []
    for t in canonical_tags:
        slug = _CANONICAL_TO_LC_SLUG.get(t)
        if slug and slug not in slugs:
            slugs.append(slug)
    return slugs


# ── CSES problems (static curated list) ──────────────────────────────────────
# Tagged with CANONICAL names so normalization always produces matches.
# Covers the most important problems across all major topics.

_CSES_PROBLEMS = [
    # Sorting & Searching
    {"id": 1621, "title": "Distinct Numbers",         "tags": ["sorting"]},
    {"id": 1084, "title": "Apartments",               "tags": ["sorting", "greedy"]},
    {"id": 1090, "title": "Ferris Wheel",              "tags": ["sorting", "greedy"]},
    {"id": 1091, "title": "Concert Tickets",           "tags": ["sorting", "binary search"]},
    {"id": 1163, "title": "Traffic Lights",            "tags": ["sorting"]},
    {"id": 1164, "title": "Room Allocation",           "tags": ["sorting", "greedy"]},
    {"id": 1090, "title": "Subarray Sums I",           "tags": ["prefix sum", "binary search"]},
    {"id": 1661, "title": "Subarray Sums II",          "tags": ["prefix sum", "hashing"]},
    {"id": 1662, "title": "Subarray Divisibility",     "tags": ["prefix sum", "hashing"]},
    # Two Pointers
    {"id": 1640, "title": "Sum of Two Values",         "tags": ["two pointers", "binary search"]},
    {"id": 1641, "title": "Maximum Subarray Sum",      "tags": ["dp", "greedy"]},
    # Binary Search
    {"id": 1085, "title": "Array Division",            "tags": ["binary search"]},
    {"id": 1086, "title": "Factory Machines",          "tags": ["binary search"]},
    {"id": 1620, "title": "Factory Machines II",       "tags": ["binary search"]},
    # Dynamic Programming
    {"id": 1633, "title": "Dice Combinations",         "tags": ["dp"]},
    {"id": 1634, "title": "Minimizing Coins",          "tags": ["dp"]},
    {"id": 1635, "title": "Coin Combinations I",       "tags": ["dp"]},
    {"id": 1636, "title": "Coin Combinations II",      "tags": ["dp"]},
    {"id": 1637, "title": "Removing Digits",           "tags": ["dp", "greedy"]},
    {"id": 1638, "title": "Grid Paths",                "tags": ["dp"]},
    {"id": 1639, "title": "Edit Distance",             "tags": ["dp", "strings"]},
    {"id": 1640, "title": "Rectangle Cutting",         "tags": ["dp"]},
    {"id": 1641, "title": "Money Sums",                "tags": ["dp"]},
    {"id": 1642, "title": "Removal Game",              "tags": ["dp", "game theory"]},
    {"id": 1644, "title": "Increasing Subsequence",    "tags": ["dp", "binary search"]},
    {"id": 1645, "title": "Projects",                  "tags": ["dp", "sorting"]},
    {"id": 2413, "title": "Elevator Rides",            "tags": ["dp", "bit manipulation"]},
    # Graphs
    {"id": 1192, "title": "Counting Rooms",            "tags": ["graphs"]},
    {"id": 1193, "title": "Labyrinth",                 "tags": ["graphs"]},
    {"id": 1666, "title": "Building Roads",            "tags": ["graphs", "union find"]},
    {"id": 1667, "title": "Message Route",             "tags": ["graphs"]},
    {"id": 1668, "title": "Building Teams",            "tags": ["graphs"]},
    {"id": 1669, "title": "Round Trip",                "tags": ["graphs"]},
    {"id": 1194, "title": "Monsters",                  "tags": ["graphs"]},
    {"id": 1671, "title": "Shortest Routes I",         "tags": ["graphs", "shortest path"]},
    {"id": 1672, "title": "Shortest Routes II",        "tags": ["graphs", "shortest path"]},
    {"id": 1673, "title": "High Score",                "tags": ["graphs", "shortest path"]},
    {"id": 1675, "title": "Flight Discount",           "tags": ["graphs", "shortest path"]},
    {"id": 1679, "title": "Course Schedule",           "tags": ["graphs"]},
    {"id": 1680, "title": "Longest Flight Route",      "tags": ["graphs", "dp"]},
    {"id": 1681, "title": "Game Routes",               "tags": ["graphs", "dp"]},
    {"id": 1682, "title": "Investigation",             "tags": ["graphs", "shortest path"]},
    # Union-Find / DSU
    {"id": 1676, "title": "Road Construction",         "tags": ["union find"]},
    {"id": 1683, "title": "Planets and Kingdoms",      "tags": ["union find", "graphs"]},
    {"id": 1684, "title": "Giant Pizza",               "tags": ["union find"]},
    # Trees
    {"id": 1674, "title": "Tree Diameter",             "tags": ["trees"]},
    {"id": 1676, "title": "Counting Paths",            "tags": ["trees"]},
    {"id": 1677, "title": "Subtree Queries",           "tags": ["trees", "segment tree"]},
    {"id": 1135, "title": "Tree Distances I",          "tags": ["trees"]},
    {"id": 1136, "title": "Tree Distances II",         "tags": ["trees"]},
    {"id": 1137, "title": "Company Queries I",         "tags": ["trees"]},
    {"id": 1138, "title": "Company Queries II",        "tags": ["trees"]},
    {"id": 1139, "title": "Distance Queries",          "tags": ["trees"]},
    # Mathematics
    {"id": 1095, "title": "Exponentiation",            "tags": ["math", "number theory"]},
    {"id": 1712, "title": "Exponentiation II",         "tags": ["math", "number theory"]},
    {"id": 1713, "title": "Counting Divisors",         "tags": ["math", "number theory"]},
    {"id": 1081, "title": "Common Divisors",           "tags": ["math", "number theory"]},
    {"id": 1082, "title": "Sum of Divisors",           "tags": ["math", "number theory"]},
    {"id": 1079, "title": "Binomial Coefficients",     "tags": ["math", "combinatorics"]},
    {"id": 1715, "title": "Creating Strings II",       "tags": ["math", "combinatorics"]},
    {"id": 2183, "title": "Counting Coprime Pairs",    "tags": ["math", "number theory"]},
    # Strings
    {"id": 1753, "title": "String Matching",           "tags": ["strings"]},
    {"id": 1732, "title": "Finding Borders",           "tags": ["strings"]},
    {"id": 1733, "title": "Finding Periods",           "tags": ["strings"]},
    {"id": 1100, "title": "Palindrome Reorder",        "tags": ["strings", "greedy"]},
    {"id": 1753, "title": "String Matching",           "tags": ["strings", "hashing"]},
    # Segment Tree / Data Structures
    {"id": 1648, "title": "Dynamic Range Sum Queries", "tags": ["segment tree"]},
    {"id": 1649, "title": "Dynamic Range Min Queries", "tags": ["segment tree"]},
    {"id": 1650, "title": "Range Xor Queries",         "tags": ["segment tree", "bit manipulation"]},
    {"id": 1651, "title": "Static Range Min Queries",  "tags": ["segment tree"]},
    {"id": 1652, "title": "Dynamic Range Counting",    "tags": ["segment tree"]},
    {"id": 1653, "title": "Forest Queries",            "tags": ["prefix sum"]},
    {"id": 1655, "title": "Hotel Queries",             "tags": ["segment tree"]},
    {"id": 1656, "title": "List Removals",             "tags": ["segment tree", "data structures"]},
    # Bit manipulation
    {"id": 2205, "title": "Gray Code",                 "tags": ["bit manipulation"]},
    {"id": 2169, "title": "Counting Ones",             "tags": ["bit manipulation", "math"]},
]


def fetch_cses_problems(canonical_tags: list[str]) -> list[dict]:
    """
    Return CSES problems matching any canonical tag.
    Pure Python — instant, no network.
    """
    if not canonical_tags:
        return []
    tag_set = {t.lower() for t in canonical_tags}
    seen    = set()
    results = []
    for p in _CSES_PROBLEMS:
        p_tags = {t.lower() for t in p["tags"]}
        if tag_set & p_tags:
            key = p["id"]
            if key not in seen:
                seen.add(key)
                results.append({
                    "_id":        str(p["id"]),
                    "title":      p["title"],
                    "url":        f"https://cses.fi/problemset/task/{p['id']}",
                    "platform":   "cses",
                    "difficulty": "medium",
                    "tags":       p["tags"],
                    "rating":     0,
                })
    return results


# ── Codeforces ────────────────────────────────────────────────────────────────

async def fetch_cf_problems(
    tags: list[str],
    min_rating: int = 800,
    max_rating: int = 3500,
) -> list[dict]:
    """Fetch CF problems for given tags within rating range."""
    if not tags:
        return []

    results  = []
    seen_ids = set()

    async with httpx.AsyncClient() as client:
        tasks      = [_fetch_cf_tag(client, tag, min_rating, max_rating) for tag in tags[:6]]
        tag_results = await asyncio.gather(*tasks, return_exceptions=True)

    for batch in tag_results:
        if isinstance(batch, (Exception, BaseException)):
            continue
        for p in batch:
            pid = p.get("_id")
            if pid and pid not in seen_ids:
                seen_ids.add(pid)
                results.append(p)

    return results


async def _fetch_cf_tag(
    client: httpx.AsyncClient,
    tag: str,
    min_rating: int,
    max_rating: int,
) -> list[dict]:
    """Fetch CF problems for a single tag."""
    try:
        r = await client.get(
            "https://codeforces.com/api/problemset.problems",
            params={"tags": tag},
            timeout=_TIMEOUT,
        )
        if r.status_code != 200:
            return []
        data = r.json()
        if data.get("status") != "OK":
            return []

        out = []
        for p in data["result"].get("problems", []):
            rating = p.get("rating", 0) or 0
            if not (min_rating <= rating <= max_rating):
                continue
            cid = p.get("contestId", "")
            idx = p.get("index", "")
            out.append({
                "_id":        f"{cid}{idx}",
                "title":      p.get("name", ""),
                "url":        f"https://codeforces.com/problemset/problem/{cid}/{idx}",
                "platform":   "codeforces",
                "difficulty": str(rating),
                "tags":       p.get("tags", []),
                "rating":     rating,
            })
        return out
    except Exception:
        return []


# ── LeetCode ──────────────────────────────────────────────────────────────────

_LC_DIFF = {"easy": "EASY", "medium": "MEDIUM", "hard": "HARD"}


async def fetch_lc_problems(
    tags: list[str],
    difficulty: str = "medium",
    limit: int = 20,
) -> list[dict]:
    """
    Fetch LC problems for given tags via GraphQL.

    Uses the correct LC GraphQL query structure:
      questionList(categorySlug, limit, skip, filters)

    tags: canonical tag names (will be converted to LC slugs internally).
    """
    if not tags:
        return []

    lc_slugs = _canonical_to_lc_slugs(tags)
    if not lc_slugs:
        # No valid LC slugs found — return empty (better than garbage results)
        print(f"[LC Problems] No LC slugs found for tags: {tags}")
        return []

    lc_diff  = _LC_DIFF.get(difficulty.lower(), "MEDIUM")
    results  = []
    seen     = set()

    async with httpx.AsyncClient() as client:
        tasks = [
            _fetch_lc_tag(client, slug, lc_diff, limit)
            for slug in lc_slugs[:5]   # max 5 tags to stay within rate limits
        ]
        batches = await asyncio.gather(*tasks, return_exceptions=True)

    for batch in batches:
        if isinstance(batch, (Exception, BaseException)):
            continue
        for p in batch:
            title = p.get("title", "")
            if title and title not in seen:
                seen.add(title)
                results.append(p)

    return results


async def _fetch_lc_tag(
    client: httpx.AsyncClient,
    tag_slug: str,
    difficulty: str,
    limit: int,
) -> list[dict]:
    """
    Fetch LC problems for one tag slug using the working GraphQL query.

    The correct query uses:
      questionList(categorySlug: "", limit: N, skip: 0, filters: {difficulty, tags})
    and returns:
      { data { title titleSlug difficulty topicTags { name } } }
    """
    query = """
    query problemsetQuestionList(
      $categorySlug: String
      $limit: Int
      $skip: Int
      $filters: QuestionListFilterInput
    ) {
      questionList(
        categorySlug: $categorySlug
        limit: $limit
        skip: $skip
        filters: $filters
      ) {
        totalNum
        data {
          title
          titleSlug
          difficulty
          topicTags { name slug }
        }
      }
    }
    """
    variables = {
        "categorySlug": "",
        "limit":        limit,
        "skip":         0,
        "filters": {
            "difficulty": difficulty,
            "tags":       [tag_slug],
        },
    }

    try:
        r = await client.post(
            _LC_GQL,
            json={"query": query, "variables": variables},
            headers=_LC_HDR,
            timeout=_TIMEOUT,
        )
        if r.status_code != 200:
            print(f"[LC Problems] GraphQL HTTP {r.status_code} for tag={tag_slug}")
            return []

        data = r.json().get("data", {})
        ql   = data.get("questionList") or {}
        rows = ql.get("data") or []

        if not rows:
            # Try without difficulty filter — tag alone might yield results
            variables2 = {
                "categorySlug": "",
                "limit":        limit,
                "skip":         0,
                "filters":      {"tags": [tag_slug]},
            }
            r2 = await client.post(
                _LC_GQL,
                json={"query": query, "variables": variables2},
                headers=_LC_HDR,
                timeout=_TIMEOUT,
            )
            if r2.status_code == 200:
                data2 = r2.json().get("data", {})
                rows  = (data2.get("questionList") or {}).get("data") or []

        return _normalize_lc(rows)

    except Exception as e:
        print(f"[LC Problems] Error for tag={tag_slug}: {type(e).__name__}: {e}")
        return []


def _normalize_lc(raw: list) -> list[dict]:
    """Convert LC GraphQL problem rows to uniform structure."""
    out = []
    for p in raw:
        title    = p.get("title", "") or ""
        slug     = p.get("titleSlug", "") or title.lower().replace(" ", "-")
        diff     = (p.get("difficulty") or "MEDIUM").lower()
        tags_raw = p.get("topicTags") or []
        tags     = [t.get("name", "") for t in tags_raw if t.get("name")]
        if not title:
            continue
        out.append({
            "_id":        slug,
            "title":      title,
            "url":        f"https://leetcode.com/problems/{slug}/",
            "platform":   "leetcode",
            "difficulty": diff,
            "tags":       tags,
            "rating":     0,
        })
    return out