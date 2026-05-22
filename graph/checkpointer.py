"""
graph/checkpointer.py
----------------------
Sets up LangGraph's SqliteSaver for persistent state checkpointing.

This means:
- Scraped data is cached across Python runs
- You can resume a paused graph (e.g. HITL) from where it stopped
- Each (cf_username, lc_username) pair gets its own thread_id

Compatibility note:
- langgraph >= 0.3: SqliteSaver lives in the separate package
  `langgraph-checkpoint-sqlite` (pip install langgraph-checkpoint-sqlite).
  The import path is still `langgraph.checkpoint.sqlite`.
- If the package is not installed, we fall back to MemorySaver (in-memory,
  no persistence across restarts, but fully functional for a single session).
"""

import os
import sqlite3
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

_DB_PATH = os.getenv("CHECKPOINT_DB", "./output/checkpoints.db")


def get_checkpointer():
    """
    Returns a checkpointer for LangGraph state persistence.

    Tries SqliteSaver first (requires `langgraph-checkpoint-sqlite`).
    Falls back to MemorySaver if the package isn't installed, so the
    app still runs — you just lose cross-restart persistence.

    To enable persistence:
        pip install langgraph-checkpoint-sqlite
    """
    # ── Attempt 1: SqliteSaver (persistent) ──────────────────────────────────
    try:
        from langgraph.checkpoint.sqlite import SqliteSaver  # noqa: F401 (verify import works)

        db_path = Path(_DB_PATH)
        db_path.parent.mkdir(parents=True, exist_ok=True)

        # Open a raw sqlite3 connection — SqliteSaver manages the schema itself.
        conn = sqlite3.connect(str(db_path), check_same_thread=False)
        print(f"[Checkpointer] Using SqliteSaver at '{db_path}'")
        return SqliteSaver(conn)

    except (ImportError, ModuleNotFoundError):
        # Package not installed — degrade gracefully to in-memory checkpointing.
        print(
            "[Checkpointer] 'langgraph-checkpoint-sqlite' not found — "
            "falling back to MemorySaver (state will NOT persist across restarts).\n"
            "  Fix: pip install langgraph-checkpoint-sqlite"
        )

    # ── Attempt 2: MemorySaver (in-process, no disk persistence) ─────────────
    from langgraph.checkpoint.memory import MemorySaver
    return MemorySaver()


def make_thread_id(cf_username: str, lc_username: str) -> str:
    """
    Generate a stable thread_id for a given user pair.
    LangGraph uses this to scope checkpoints per conversation/session.
    """
    cf = (cf_username or "none").lower().strip()
    lc = (lc_username or "none").lower().strip()
    return f"cp-agent-{cf}-{lc}"