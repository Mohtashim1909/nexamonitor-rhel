"""
NexaMonitor Reporting Service
Computes daily, weekly, and custom monitoring audit reports from stored SQLite telemetry,
and generates downloadable RFC4180 CSV exports and professional PDF reports using ReportLab.
"""

import io
import csv
import datetime
from typing import Dict, Any, List, Optional
import logging
from sqlalchemy import text
from app.database.connection import SessionLocal

logger = logging.getLogger("nexamonitor.report_service")


class ReportService:
    def get_report_data(
        self, start_dt: datetime.datetime, end_dt: datetime.datetime, report_type: str = "daily"
    ) -> Dict[str, Any]:
        """Aggregate actual historical timeseries data to construct a comprehensive monitoring report."""
        db = SessionLocal()
        now_utc = datetime.datetime.utcnow()

        try:
            # 1. Total unique containers monitored in window
            c_rows = db.execute(
                text("""
                    SELECT
                        container_id,
                        COALESCE(MAX(container_name), container_id) AS name,
                        ROUND(AVG(cpu_percent), 2) AS avg_cpu,
                        ROUND(MAX(cpu_percent), 2) AS max_cpu,
                        ROUND(AVG(memory_usage), 0) AS avg_mem,
                        ROUND(MAX(memory_usage), 0) AS max_mem,
                        ROUND(MAX(memory_percent), 2) AS max_mem_pct,
                        COUNT(id) AS sample_count
                    FROM container_metrics
                    WHERE timestamp >= :start_dt AND timestamp <= :end_dt
                    GROUP BY container_id
                """),
                {"start_dt": start_dt, "end_dt": end_dt},
            ).fetchall()

            containers_list: List[Dict[str, Any]] = []
            for r in c_rows:
                containers_list.append({
                    "container_id": r[0],
                    "container_name": r[1],
                    "avg_cpu_percent": r[2] or 0.0,
                    "peak_cpu_percent": r[3] or 0.0,
                    "avg_memory_bytes": int(r[4] or 0),
                    "peak_memory_bytes": int(r[5] or 0),
                    "peak_memory_percent": r[6] or 0.0,
                    "sample_count": r[7] or 0,
                })

            # Sort containers by avg CPU descending
            containers_list.sort(key=lambda x: x["avg_cpu_percent"], reverse=True)
            top_consumers = containers_list[:5]

            # 2. Cluster-wide CPU & Memory aggregates
            cluster_row = db.execute(
                text("""
                    SELECT
                        ROUND(AVG(cpu_percent), 2),
                        ROUND(MAX(cpu_percent), 2),
                        ROUND(AVG(memory_usage), 0),
                        ROUND(MAX(memory_usage), 0)
                    FROM container_metrics
                    WHERE timestamp >= :start_dt AND timestamp <= :end_dt
                """),
                {"start_dt": start_dt, "end_dt": end_dt},
            ).fetchone()

            avg_cpu = cluster_row[0] if cluster_row and cluster_row[0] is not None else 0.0
            peak_cpu = cluster_row[1] if cluster_row and cluster_row[1] is not None else 0.0
            avg_mem = int(cluster_row[2]) if cluster_row and cluster_row[2] is not None else 0
            peak_mem = int(cluster_row[3]) if cluster_row and cluster_row[3] is not None else 0

            # 3. Calculate true Network Volume (monotonic counter diffs)
            net_rows = db.execute(
                text("""
                    SELECT container_id, network_rx, network_tx
                    FROM container_metrics
                    WHERE timestamp >= :start_dt AND timestamp <= :end_dt
                    ORDER BY container_id, timestamp ASC
                """),
                {"start_dt": start_dt, "end_dt": end_dt},
            ).fetchall()

            total_rx_bytes = 0
            total_tx_bytes = 0
            prev_rx: Dict[str, int] = {}
            prev_tx: Dict[str, int] = {}

            for cid, rx, tx in net_rows:
                if rx is not None:
                    if cid in prev_rx and rx >= prev_rx[cid]:
                        total_rx_bytes += rx - prev_rx[cid]
                    prev_rx[cid] = rx
                if tx is not None:
                    if cid in prev_tx and tx >= prev_tx[cid]:
                        total_tx_bytes += tx - prev_tx[cid]
                    prev_tx[cid] = tx

            # 4. Disk volume
            disk_rows = db.execute(
                text("""
                    SELECT container_id, disk_read_bytes, disk_write_bytes
                    FROM container_metrics
                    WHERE timestamp >= :start_dt AND timestamp <= :end_dt
                    ORDER BY container_id, timestamp ASC
                """),
                {"start_dt": start_dt, "end_dt": end_dt},
            ).fetchall()

            total_disk_read_bytes = 0
            total_disk_write_bytes = 0
            prev_dr: Dict[str, int] = {}
            prev_dw: Dict[str, int] = {}

            for cid, dr, dw in disk_rows:
                if dr is not None:
                    if cid in prev_dr and dr >= prev_dr[cid]:
                        total_disk_read_bytes += dr - prev_dr[cid]
                    prev_dr[cid] = dr
                if dw is not None:
                    if cid in prev_dw and dw >= prev_dw[cid]:
                        total_disk_write_bytes += dw - prev_dw[cid]
                    prev_dw[cid] = dw

            # 5. Alerts Summary in window
            alert_rows = db.execute(
                text("""
                    SELECT
                        COUNT(id) AS total_alerts,
                        SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) AS critical_alerts,
                        SUM(CASE WHEN severity = 'warning' THEN 1 ELSE 0 END) AS warning_alerts
                    FROM alerts
                    WHERE triggered_at >= :start_dt AND triggered_at <= :end_dt
                """),
                {"start_dt": start_dt, "end_dt": end_dt},
            ).fetchone()

            total_alerts = alert_rows[0] or 0 if alert_rows else 0
            crit_alerts = alert_rows[1] or 0 if alert_rows else 0
            warn_alerts = alert_rows[2] or 0 if alert_rows else 0

            # 6. Container restarts from Docker SDK if available
            restarts_summary: List[Dict[str, Any]] = []
            try:
                from app.services.docker_service import docker_service
                if docker_service.is_connected:
                    c_all = docker_service.get_containers(all_containers=True)
                    for c in c_all:
                        rc = c.get("restart_count", 0)
                        if rc > 0:
                            restarts_summary.append({
                                "container_name": c.get("name"),
                                "container_id": c.get("id", "")[:12],
                                "restarts": rc,
                                "status": c.get("status"),
                            })
            except Exception:
                pass

            title = "NexaMonitor Daily Container Performance Audit" if report_type == "daily" else "NexaMonitor Weekly Capacity & Health Report"

            return {
                "report_id": f"rep-{report_type}-{now_utc.strftime('%Y%m%d%H%M%S')}",
                "report_type": report_type,
                "title": title,
                "generated_at": now_utc.isoformat() + "Z",
                "period": {
                    "start": start_dt.isoformat() + "Z",
                    "end": end_dt.isoformat() + "Z",
                },
                "summary": {
                    "containers_monitored": len(containers_list),
                    "total_containers_tracked": len(containers_list),
                    "avg_cpu_percent": avg_cpu,
                    "peak_cpu_percent": peak_cpu,
                    "avg_memory_bytes": avg_mem,
                    "peak_memory_bytes": peak_mem,
                    "avg_memory_mb": round(avg_mem / (1024 * 1024), 1),
                    "peak_memory_mb": round(peak_mem / (1024 * 1024), 1),
                    "total_network_rx_bytes": total_rx_bytes,
                    "total_network_tx_bytes": total_tx_bytes,
                    "total_network_rx_mb": round(total_rx_bytes / (1024 * 1024), 1),
                    "total_network_tx_mb": round(total_tx_bytes / (1024 * 1024), 1),
                    "total_disk_read_bytes": total_disk_read_bytes,
                    "total_disk_write_bytes": total_disk_write_bytes,
                    "total_disk_read_mb": round(total_disk_read_bytes / (1024 * 1024), 1),
                    "total_disk_write_mb": round(total_disk_write_bytes / (1024 * 1024), 1),
                    "total_alerts": total_alerts,
                    "total_alerts_count": total_alerts,
                    "critical_alerts": crit_alerts,
                    "critical_alerts_count": crit_alerts,
                    "warning_alerts": warn_alerts,
                    "warning_alerts_count": warn_alerts,
                    "container_restarts_detected": len(restarts_summary),
                },
                "top_consumers": top_consumers,
                "all_containers": containers_list,
                "containers": containers_list,
                "restarts_summary": restarts_summary,
            }
        finally:
            db.close()

    def generate_csv(self, report_data: Dict[str, Any]) -> str:
        """Serialize report data into an RFC4180 CSV spreadsheet."""
        output = io.StringIO()
        writer = csv.writer(output, quoting=csv.QUOTE_MINIMAL)

        writer.writerow(["NexaMonitor Performance & Telemetry Report"])
        writer.writerow(["Title", report_data.get("title")])
        writer.writerow(["Report ID", report_data.get("report_id")])
        writer.writerow(["Generated At", report_data.get("generated_at")])
        writer.writerow(["Reporting Period Start", report_data.get("period", {}).get("start")])
        writer.writerow(["Reporting Period End", report_data.get("period", {}).get("end")])
        writer.writerow([])

        # Summary KPIs
        summary = report_data.get("summary", {})
        writer.writerow(["=== SUMMARY METRICS ==="])
        writer.writerow(["Containers Monitored", summary.get("containers_monitored")])
        writer.writerow(["Average CPU %", summary.get("avg_cpu_percent")])
        writer.writerow(["Peak CPU %", summary.get("peak_cpu_percent")])
        writer.writerow(["Average Memory (Bytes)", summary.get("avg_memory_bytes")])
        writer.writerow(["Peak Memory (Bytes)", summary.get("peak_memory_bytes")])
        writer.writerow(["Total Network RX (Bytes)", summary.get("total_network_rx_bytes")])
        writer.writerow(["Total Network TX (Bytes)", summary.get("total_network_tx_bytes")])
        writer.writerow(["Total Disk Read (Bytes)", summary.get("total_disk_read_bytes")])
        writer.writerow(["Total Disk Write (Bytes)", summary.get("total_disk_write_bytes")])
        writer.writerow(["Total Alerts Triggered", summary.get("total_alerts")])
        writer.writerow(["Critical Alerts", summary.get("critical_alerts")])
        writer.writerow(["Warning Alerts", summary.get("warning_alerts")])
        writer.writerow([])

        # Container Breakdown
        writer.writerow(["=== CONTAINER RESOURCE BREAKDOWN ==="])
        writer.writerow([
            "Container ID",
            "Container Name",
            "Average CPU %",
            "Peak CPU %",
            "Average Memory (Bytes)",
            "Peak Memory (Bytes)",
            "Peak Memory %",
            "Telemetry Samples",
        ])
        for c in report_data.get("all_containers", []):
            writer.writerow([
                c.get("container_id"),
                c.get("container_name"),
                c.get("avg_cpu_percent"),
                c.get("peak_cpu_percent"),
                c.get("avg_memory_bytes"),
                c.get("peak_memory_bytes"),
                c.get("peak_memory_percent"),
                c.get("sample_count"),
            ])

        writer.writerow([])
        # Restarts
        restarts = report_data.get("restarts_summary", [])
        if restarts:
            writer.writerow(["=== CONTAINER RESTARTS AUDIT ==="])
            writer.writerow(["Container Name", "Container ID", "Restart Count", "Status"])
            for r in restarts:
                writer.writerow([r.get("container_name"), r.get("container_id"), r.get("restarts"), r.get("status")])

        return output.getvalue()

    def generate_pdf(self, report_data: Dict[str, Any]) -> bytes:
        """Render a publication-ready PDF document using ReportLab with tables and NexaMonitor branding."""
        from reportlab.lib import colors
        from reportlab.lib.pagesizes import letter
        from reportlab.platypus import (
            SimpleDocTemplate,
            Paragraph,
            Spacer,
            Table,
            TableStyle,
            HRFlowable,
        )
        from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle

        buffer = io.BytesIO()
        doc = SimpleDocTemplate(
            buffer,
            pagesize=letter,
            rightMargin=36,
            leftMargin=36,
            topMargin=36,
            bottomMargin=36,
        )

        styles = getSampleStyleSheet()
        normal = styles["Normal"]
        title_style = ParagraphStyle(
            "ReportTitle",
            parent=normal,
            fontName="Helvetica-Bold",
            fontSize=20,
            leading=24,
            textColor=colors.HexColor("#0f172a"),
        )
        subtitle_style = ParagraphStyle(
            "ReportSubtitle",
            parent=normal,
            fontName="Helvetica",
            fontSize=10,
            leading=14,
            textColor=colors.HexColor("#64748b"),
        )
        heading_style = ParagraphStyle(
            "SectionHeading",
            parent=normal,
            fontName="Helvetica-Bold",
            fontSize=13,
            leading=17,
            textColor=colors.HexColor("#1e293b"),
            spaceBefore=12,
            spaceAfter=6,
        )
        table_text = ParagraphStyle(
            "TableText",
            parent=normal,
            fontName="Helvetica",
            fontSize=8,
            leading=11,
            textColor=colors.HexColor("#1e293b"),
        )
        table_header = ParagraphStyle(
            "TableHeader",
            parent=normal,
            fontName="Helvetica-Bold",
            fontSize=8,
            leading=11,
            textColor=colors.HexColor("#ffffff"),
        )

        elements = []

        # 1. Header Banner
        elements.append(Paragraph("NexaMonitor", title_style))
        elements.append(Paragraph("Container Resource Monitoring & Management System", subtitle_style))
        elements.append(Spacer(1, 6))
        elements.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor("#3b82f6"), spaceBefore=2, spaceAfter=10))

        # 2. Report Metadata
        title_text = report_data.get("title", "Telemetry Audit Report")
        period_str = f"{report_data.get('period', {}).get('start', '')[:19].replace('T', ' ')} UTC to {report_data.get('period', {}).get('end', '')[:19].replace('T', ' ')} UTC"
        gen_str = f"Generated: {report_data.get('generated_at', '')[:19].replace('T', ' ')} UTC | ID: {report_data.get('report_id')}"

        elements.append(Paragraph(f"<b>{title_text}</b>", ParagraphStyle("H2", parent=normal, fontName="Helvetica-Bold", fontSize=14, leading=18)))
        elements.append(Paragraph(f"<b>Period:</b> {period_str}", subtitle_style))
        elements.append(Paragraph(gen_str, subtitle_style))
        elements.append(Spacer(1, 10))

        # 3. KPI Summary Table
        elements.append(Paragraph("System Resource Summary", heading_style))
        summary = report_data.get("summary", {})

        def fmt_bytes(val):
            if val is None or val == 0:
                return "0 B"
            units = ["B", "KB", "MB", "GB", "TB"]
            i = 0
            v = float(val)
            while v >= 1024.0 and i < len(units) - 1:
                v /= 1024.0
                i += 1
            return f"{v:.1f} {units[i]}"

        summary_rows = [
            [
                Paragraph("<b>Metric</b>", table_header),
                Paragraph("<b>Average</b>", table_header),
                Paragraph("<b>Peak Value</b>", table_header),
                Paragraph("<b>Total Volume / Count</b>", table_header),
            ],
            [
                Paragraph("CPU Utilization", table_text),
                Paragraph(f"{summary.get('avg_cpu_percent', 0.0)}%", table_text),
                Paragraph(f"{summary.get('peak_cpu_percent', 0.0)}%", table_text),
                Paragraph(f"{summary.get('containers_monitored', 0)} containers", table_text),
            ],
            [
                Paragraph("Memory Footprint", table_text),
                Paragraph(fmt_bytes(summary.get('avg_memory_bytes', 0)), table_text),
                Paragraph(fmt_bytes(summary.get('peak_memory_bytes', 0)), table_text),
                Paragraph("—", table_text),
            ],
            [
                Paragraph("Network Traffic", table_text),
                Paragraph("—", table_text),
                Paragraph("—", table_text),
                Paragraph(f"RX: {fmt_bytes(summary.get('total_network_rx_bytes', 0))} | TX: {fmt_bytes(summary.get('total_network_tx_bytes', 0))}", table_text),
            ],
            [
                Paragraph("Disk Block I/O", table_text),
                Paragraph("—", table_text),
                Paragraph("—", table_text),
                Paragraph(f"Read: {fmt_bytes(summary.get('total_disk_read_bytes', 0))} | Write: {fmt_bytes(summary.get('total_disk_write_bytes', 0))}", table_text),
            ],
            [
                Paragraph("Incident Alerts", table_text),
                Paragraph(f"{summary.get('total_alerts', 0)} total", table_text),
                Paragraph(f"{summary.get('critical_alerts', 0)} critical", table_text),
                Paragraph(f"{summary.get('warning_alerts', 0)} warnings", table_text),
            ],
        ]

        summary_table = Table(summary_rows, colWidths=[130, 100, 100, 210])
        summary_table.setStyle(TableStyle([
            ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#1e293b")),
            ("ALIGN", (0, 0), (-1, -1), "LEFT"),
            ("VALIGN", (0, 0), (-1, -1), "MIDDLE"),
            ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
            ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
            ("TOPPADDING", (0, 0), (-1, -1), 4),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ]))
        elements.append(summary_table)
        elements.append(Spacer(1, 10))

        # 4. Top Consumers Table
        elements.append(Paragraph("Top Resource Consumers Breakdown", heading_style))
        consumers = report_data.get("top_consumers", [])
        if consumers:
            cons_rows = [
                [
                    Paragraph("<b>Container Name</b>", table_header),
                    Paragraph("<b>ID</b>", table_header),
                    Paragraph("<b>Avg CPU %</b>", table_header),
                    Paragraph("<b>Peak CPU %</b>", table_header),
                    Paragraph("<b>Peak RAM</b>", table_header),
                    Paragraph("<b>Samples</b>", table_header),
                ]
            ]
            for c in consumers:
                cons_rows.append([
                    Paragraph(str(c.get("container_name")), table_text),
                    Paragraph(str(c.get("container_id"))[:12], table_text),
                    Paragraph(f"{c.get('avg_cpu_percent', 0.0)}%", table_text),
                    Paragraph(f"{c.get('peak_cpu_percent', 0.0)}%", table_text),
                    Paragraph(fmt_bytes(c.get("peak_memory_bytes", 0)), table_text),
                    Paragraph(str(c.get("sample_count", 0)), table_text),
                ])

            cons_table = Table(cons_rows, colWidths=[140, 80, 80, 80, 90, 70])
            cons_table.setStyle(TableStyle([
                ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#2563eb")),
                ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#cbd5e1")),
                ("ROWBACKGROUNDS", (0, 1), (-1, -1), [colors.white, colors.HexColor("#f8fafc")]),
                ("TOPPADDING", (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
            ]))
            elements.append(cons_table)
        else:
            elements.append(Paragraph("<i>No container telemetry records found in the specified reporting window.</i>", subtitle_style))

        elements.append(Spacer(1, 15))
        elements.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor("#cbd5e1"), spaceBefore=5, spaceAfter=8))
        elements.append(Paragraph("NexaMonitor — Monitor. Analyze. Optimize. | Production Infrastructure Audit Report", subtitle_style))

        doc.build(elements)
        return buffer.getvalue()


report_service = ReportService()
