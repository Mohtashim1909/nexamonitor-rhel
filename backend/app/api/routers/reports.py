"""
Reports API Router
Provides endpoints to generate daily, weekly, and custom monitoring audit reports,
and download CSV and PDF reports using actual stored historical data.
"""

import datetime
from typing import Optional
from fastapi import APIRouter, HTTPException, Query, Response
from app.services.report_service import report_service

router = APIRouter()


def _resolve_time_window(report_type: str, start_time: Optional[str] = None, end_time: Optional[str] = None):
    now_utc = datetime.datetime.utcnow()
    if report_type == "daily":
        start_dt = now_utc - datetime.timedelta(hours=24)
        end_dt = now_utc
    elif report_type == "weekly":
        start_dt = now_utc - datetime.timedelta(days=7)
        end_dt = now_utc
    elif report_type == "custom":
        if not start_time:
            start_dt = now_utc - datetime.timedelta(hours=24)
        else:
            start_dt = datetime.datetime.fromisoformat(start_time.replace("Z", "+00:00")).replace(tzinfo=None)
        if not end_time:
            end_dt = now_utc
        else:
            end_dt = datetime.datetime.fromisoformat(end_time.replace("Z", "+00:00")).replace(tzinfo=None)
    else:
        start_dt = now_utc - datetime.timedelta(hours=24)
        end_dt = now_utc
    return start_dt, end_dt


@router.get("/daily")
async def get_daily_report():
    """Generate daily monitoring performance audit for the past 24 hours."""
    start_dt, end_dt = _resolve_time_window("daily")
    return report_service.get_report_data(start_dt, end_dt, report_type="daily")


@router.get("/weekly")
async def get_weekly_report():
    """Generate weekly monitoring capacity audit for the past 7 days."""
    start_dt, end_dt = _resolve_time_window("weekly")
    return report_service.get_report_data(start_dt, end_dt, report_type="weekly")


@router.get("/custom")
async def get_custom_report(
    start_time: str = Query(..., description="Start timestamp (ISO 8601)"),
    end_time: str = Query(..., description="End timestamp (ISO 8601)"),
):
    """Generate monitoring report for a custom time range."""
    try:
        start_dt, end_dt = _resolve_time_window("custom", start_time, end_time)
        return report_service.get_report_data(start_dt, end_dt, report_type="custom")
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Invalid date format: {e}")


@router.get("/{report_type}/export/csv")
async def export_report_csv(
    report_type: str,
    start_time: Optional[str] = Query(None),
    end_time: Optional[str] = Query(None),
):
    """Download RFC4180 CSV spreadsheet export of the report."""
    try:
        start_dt, end_dt = _resolve_time_window(report_type, start_time, end_time)
        report_data = report_service.get_report_data(start_dt, end_dt, report_type=report_type)
        csv_content = report_service.generate_csv(report_data)

        filename = f"nexamonitor_{report_type}_report_{datetime.datetime.utcnow().strftime('%Y%m%d')}.csv"
        return Response(
            content=csv_content,
            media_type="text/csv; charset=utf-8",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate CSV export: {e}")


@router.get("/{report_type}/export/pdf")
async def export_report_pdf(
    report_type: str,
    start_time: Optional[str] = Query(None),
    end_time: Optional[str] = Query(None),
):
    """Download branded vector PDF document of the report."""
    try:
        start_dt, end_dt = _resolve_time_window(report_type, start_time, end_time)
        report_data = report_service.get_report_data(start_dt, end_dt, report_type=report_type)
        pdf_bytes = report_service.generate_pdf(report_data)

        filename = f"nexamonitor_{report_type}_report_{datetime.datetime.utcnow().strftime('%Y%m%d')}.pdf"
        return Response(
            content=pdf_bytes,
            media_type="application/pdf",
            headers={"Content-Disposition": f'attachment; filename="{filename}"'},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate PDF export: {e}")
