"""
server.py — FastAPI backend for Upsolver multi-agent intelligence platform.
Exposes LangGraph agent workflows as high-performance REST APIs for React frontend.
"""

import os
import uuid
from typing import Optional, List, Dict, Any
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from dotenv import load_dotenv

# Load environment variables (.env)
load_dotenv()

from graph.graph_builder import build_graph, make_config
from graph.checkpointer import make_thread_id
from agents.llm_utils import get_llm

app = FastAPI(
    title="Upsolver Intelligence API",
    version="2.0.0",
    description="Multi-Agent Competitive Programming Intelligence Platform Backend",
)

# Enable CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r".*",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Global compiled LangGraph instance with checkpointer
_graph = None

def get_agent_graph():
    global _graph
    if _graph is None:
        _graph = build_graph(use_checkpointing=True)
    return _graph


# ── Pydantic Request Models ──────────────────────────────────────────────────

class ReportRequest(BaseModel):
    cf_username: str = Field(..., description="Codeforces handle")
    lc_username: str = Field(..., description="LeetCode username")
    no_cache: bool = False

class PlanGenerateRequest(BaseModel):
    cf_username: str
    lc_username: str
    goal: Optional[str] = "Improve competitive programming skills"
    duration_weeks: Optional[int] = 4
    hours_per_day: Optional[int] = 2
    preferred_resources: Optional[List[str]] = []
    target_rating: Optional[int] = None

class PlanReviseRequest(BaseModel):
    cf_username: str
    lc_username: str
    feedback: str

class PlanApproveRequest(BaseModel):
    cf_username: str
    lc_username: str

class ProblemSearchRequest(BaseModel):
    cf_username: str
    lc_username: str
    difficulty: Optional[str] = "medium"
    count: Optional[int] = 30

class CompareRequest(BaseModel):
    cf_username: str
    lc_username: str
    peer_cf: Optional[str] = ""
    peer_lc: Optional[str] = ""


# ── Helper to create state dict ───────────────────────────────────────────────

def _build_initial_state(
    intent: str,
    cf: str,
    lc: str,
    peer_cf: str = "",
    peer_lc: str = "",
    user_prefs: Optional[dict] = None,
    prob_difficulty: str = "medium",
    prob_count: int = 30,
) -> dict:
    return {
        "messages": [],
        "cf_username": cf.strip(),
        "lc_username": lc.strip(),
        "cf_username2": peer_cf.strip(),
        "lc_username2": peer_lc.strip(),
        "intent": intent,
        "user_prefs": user_prefs or {
            "goal": "Improve competitive programming skills",
            "hours_per_day": 2,
            "duration_weeks": 4,
            "preferred_resources": [],
            "target_rating": None,
        },
        "prob_difficulty": prob_difficulty,
        "prob_count": prob_count,
        "cf_data": {},
        "lc_data": {},
        "cf_data2": {},
        "lc_data2": {},
        "analysis": {},
        "comparison": {},
        "plan": {},
        "problems": [],
        "report_markdown": "",
        "report_pdf_path": "",
        "errors": [],
    }


# ── API Endpoints ─────────────────────────────────────────────────────────────

@app.get("/api/health")
async def health_check():
    groq_key = os.getenv("GROQ_API_KEY", "").strip()
    google_key = os.getenv("GOOGLE_API_KEY", "").strip()
    return {
        "status": "online",
        "groq_configured": bool(groq_key),
        "google_configured": bool(google_key),
        "active_provider": "Groq" if groq_key else ("Gemini" if google_key else "Fallback (No Key)"),
    }


@app.post("/api/report")
async def generate_report(req: ReportRequest):
    if not req.cf_username and not req.lc_username:
        raise HTTPException(status_code=400, detail="Must provide at least a Codeforces handle or LeetCode username.")

    graph = get_agent_graph()
    config = make_config(req.cf_username, req.lc_username)
    state = _build_initial_state("report", req.cf_username, req.lc_username)

    try:
        # Run graph through completion
        final_state = {}
        for event in graph.stream(state, config=config, stream_mode="values"):
            final_state = event

        cf = final_state.get("cf_data") or {}
        lc = final_state.get("lc_data") or {}
        an = final_state.get("analysis") or {}
        md = final_state.get("report_markdown") or ""
        errors = final_state.get("errors") or []

        return {
            "success": True,
            "cf_data": cf,
            "lc_data": lc,
            "analysis": an,
            "report_markdown": md,
            "errors": errors,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Report generation error: {str(e)}")


@app.post("/api/plan/generate")
async def generate_plan(req: PlanGenerateRequest):
    if not req.cf_username and not req.lc_username:
        raise HTTPException(status_code=400, detail="Provide at least one handle.")

    graph = get_agent_graph()
    config = make_config(req.cf_username, req.lc_username)
    
    user_prefs = {
        "goal": req.goal or "Improve competitive programming skills",
        "duration_weeks": req.duration_weeks or 4,
        "hours_per_day": req.hours_per_day or 2,
        "preferred_resources": req.preferred_resources or [],
        "target_rating": req.target_rating,
    }

    state = _build_initial_state("plan", req.cf_username, req.lc_username, user_prefs=user_prefs)

    try:
        # Graph runs until HITL interrupt node
        for _ in graph.stream(state, config=config, stream_mode="updates"):
            pass

        # Retrieve interrupted snapshot state
        snap = graph.get_state(config)
        curr_state = snap.values or {}
        plan = curr_state.get("plan") or {}
        errors = curr_state.get("errors") or []

        return {
            "success": True,
            "status": plan.get("status", "draft"),
            "plan": plan,
            "user_prefs": curr_state.get("user_prefs", user_prefs),
            "errors": errors,
        }
    except Exception as e:
        # If interrupted by design, fetch state
        snap = graph.get_state(config)
        curr_state = snap.values or {}
        plan = curr_state.get("plan") or {}
        if plan:
            return {
                "success": True,
                "status": plan.get("status", "draft"),
                "plan": plan,
                "user_prefs": curr_state.get("user_prefs", user_prefs),
                "errors": curr_state.get("errors", []),
            }
        raise HTTPException(status_code=500, detail=f"Plan generation error: {str(e)}")


@app.post("/api/plan/revise")
async def revise_plan(req: PlanReviseRequest):
    graph = get_agent_graph()
    config = make_config(req.cf_username, req.lc_username)
    snap = graph.get_state(config)
    curr_plan = (snap.values or {}).get("plan") or {}

    try:
        # Update graph state with requested user feedback
        graph.update_state(
            config,
            {"plan": {**curr_plan, "status": "draft", "user_feedback": req.feedback}},
            as_node="hitl",
        )

        for _ in graph.stream(None, config=config, stream_mode="updates"):
            pass

        updated_snap = graph.get_state(config)
        updated_state = updated_snap.values or {}
        plan = updated_state.get("plan") or {}

        return {
            "success": True,
            "status": "draft",
            "plan": plan,
            "errors": updated_state.get("errors", []),
        }
    except Exception as e:
        updated_snap = graph.get_state(config)
        updated_state = updated_snap.values or {}
        plan = updated_state.get("plan") or {}
        if plan:
            return {
                "success": True,
                "status": "draft",
                "plan": plan,
                "errors": updated_state.get("errors", []),
            }
        raise HTTPException(status_code=500, detail=f"Plan revision error: {str(e)}")


@app.post("/api/plan/approve")
async def approve_plan(req: PlanApproveRequest):
    graph = get_agent_graph()
    config = make_config(req.cf_username, req.lc_username)
    snap = graph.get_state(config)
    curr_plan = (snap.values or {}).get("plan") or {}

    try:
        graph.update_state(
            config,
            {"plan": {**curr_plan, "status": "approved", "user_feedback": ""}},
            as_node="hitl",
        )

        try:
            for _ in graph.stream(None, config=config, stream_mode="updates"):
                pass
        except Exception:
            pass

        final_snap = graph.get_state(config)
        final_state = final_snap.values or {}
        plan = final_state.get("plan") or {}

        return {
            "success": True,
            "status": "approved",
            "plan": plan,
            "errors": final_state.get("errors", []),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Plan approval error: {str(e)}")


@app.post("/api/problems")
async def search_problems(req: ProblemSearchRequest):
    if not req.cf_username and not req.lc_username:
        raise HTTPException(status_code=400, detail="Provide at least one handle.")

    graph = get_agent_graph()
    config = make_config(req.cf_username, req.lc_username)
    state = _build_initial_state(
        "problems",
        req.cf_username,
        req.lc_username,
        prob_difficulty=req.difficulty or "medium",
        prob_count=req.count or 30,
    )

    try:
        final_state = {}
        for event in graph.stream(state, config=config, stream_mode="values"):
            final_state = event

        problems = final_state.get("problems") or []
        analysis = final_state.get("analysis") or {}
        errors = final_state.get("errors") or []

        return {
            "success": True,
            "problems": problems,
            "weak_topics": analysis.get("weak_topics", []),
            "errors": errors,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Problem search error: {str(e)}")


@app.post("/api/compare")
async def compare_peers(req: CompareRequest):
    if not req.cf_username and not req.lc_username:
        raise HTTPException(status_code=400, detail="Enter your own handles first.")
    if not req.peer_cf and not req.peer_lc:
        raise HTTPException(status_code=400, detail="Enter peer's Codeforces or LeetCode handle.")

    graph = get_agent_graph()
    # Comparison uses dual handle thread id
    thread_id = f"cmp__{req.cf_username}_{req.lc_username}__{req.peer_cf}_{req.peer_lc}"
    config = {"configurable": {"thread_id": thread_id}}

    state = _build_initial_state(
        "compare",
        req.cf_username,
        req.lc_username,
        peer_cf=req.peer_cf or "",
        peer_lc=req.peer_lc or "",
    )

    try:
        final_state = {}
        for event in graph.stream(state, config=config, stream_mode="values"):
            final_state = event

        cmp_data = final_state.get("comparison") or {}
        cf_data = final_state.get("cf_data") or {}
        lc_data = final_state.get("lc_data") or {}
        cf_data2 = final_state.get("cf_data2") or {}
        lc_data2 = final_state.get("lc_data2") or {}
        errors = final_state.get("errors") or []

        return {
            "success": True,
            "comparison": cmp_data,
            "you": {"cf_data": cf_data, "lc_data": lc_data},
            "peer": {"cf_data": cf_data2, "lc_data": lc_data2},
            "errors": errors,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Comparison error: {str(e)}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
