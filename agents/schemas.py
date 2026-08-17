"""
agents/schemas.py
-------------------
Pydantic schemas used with LangChain's `with_structured_output()` so the
planner gets back a validated Python object directly from the LLM, instead
of free text that has to be regex-extracted and repaired with json_repair.

planner_agent.py tries this path FIRST (see _call_llm_for_plan_structured).
If it fails for any reason — model/provider doesn't support structured
output, a validation error, etc. — planner_agent falls back to the original
regex + json_repair path (_call_llm_for_plan), which is left completely
unchanged. Structured output is therefore a pure reliability *improvement*
layered in front of the old path, never a replacement that could regress it.
"""

from pydantic import BaseModel, Field


class PlanResource(BaseModel):
    name: str = Field(description="Short, human-readable resource name.")
    url: str = Field(description="A URL for the resource.")


class PlanWeek(BaseModel):
    week: int = Field(description="1-indexed week number.")
    topic: str = Field(description="The main topic to focus on this week.")
    subtopics: list[str] = Field(
        default_factory=list,
        description="2-4 specific subtopics under the main topic.",
    )
    resources: list[PlanResource] = Field(
        default_factory=list,
        description="2-3 curated learning resources for this week.",
    )
    problems_per_day: int = Field(
        default=3,
        ge=1,
        le=10,
        description="Recommended number of problems to solve per day.",
    )


class StudyPlanOutput(BaseModel):
    """Top-level schema the planner LLM call is bound to via with_structured_output()."""
    goal: str = Field(description="The overall goal of the study plan, restated briefly.")
    weeks: list[PlanWeek] = Field(
        default_factory=list,
        description="Ordered list of week-by-week plan entries.",
    )
