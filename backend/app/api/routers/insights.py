"""
Insights API Router
Surfaces smart rule-based resource usage insights, anomaly detection,
and optimization suggestions.
"""

from fastapi import APIRouter, HTTPException, Path
from typing import List, Dict, Any
from app.services.insight_engine import insight_engine

router = APIRouter()


@router.get("")
@router.get("/")
async def get_insights():
    """Retrieve all active intelligent resource consumption insights."""
    return insight_engine.generate_insights()


@router.get("/summary")
async def get_insights_summary():
    """Summary counts of detected insights grouped by severity and category."""
    insights = insight_engine.generate_insights()
    counts = {
        "critical": sum(1 for i in insights if i["severity"] == "CRITICAL"),
        "warning": sum(1 for i in insights if i["severity"] == "WARNING"),
        "info": sum(1 for i in insights if i["severity"] == "INFO"),
        "total": len(insights),
    }
    by_category = {
        "cpu": sum(1 for i in insights if "CPU" in i.get("category", "")),
        "memory": sum(1 for i in insights if "MEM" in i.get("category", "")),
        "stability": sum(1 for i in insights if "RESTART" in i.get("category", "")),
        "network": sum(1 for i in insights if "NET" in i.get("category", "")),
        "optimization": sum(1 for i in insights if "IDLE" in i.get("category", "")),
    }
    return {
        "counts": counts,
        "total": counts["total"],
        "critical": counts["critical"],
        "warning": counts["warning"],
        "info": counts["info"],
        "by_category": by_category,
        "recent": insights[:5],
        "insights": insights,
    }


@router.post("/{insight_id}/dismiss")
async def dismiss_insight(insight_id: str = Path(..., description="Unique insight identifier")):
    """Dismiss an insight so it is hidden from the dashboard."""
    insight_engine.dismiss_insight(insight_id)
    return {"status": "dismissed", "insight_id": insight_id}
