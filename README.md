# NexaMonitor

> **Monitor. Analyze. Optimize.**  
> Web-based Docker Container Resource Monitoring, Historical Analytics, Intelligent Diagnostics, and Orchestration Management Platform.

![NexaMonitor](https://img.shields.io/badge/NexaMonitor-v7.0.0-3b82f6?style=flat-square)
![Status](https://img.shields.io/badge/Status-Phases%201--7%20Completed%20%26%20Verified-10b981?style=flat-square)
![FastAPI](https://img.shields.io/badge/FastAPI-0.104-009688?style=flat-square)
![Docker%20SDK](https://img.shields.io/badge/Docker%20SDK-v7.2-2496ed?style=flat-square)
![React](https://img.shields.io/badge/React-18-61dafb?style=flat-square)
![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178c6?style=flat-square)
![SQLite%20WAL](https://img.shields.io/badge/SQLite-WAL%20Mode-003B57?style=flat-square)
![WebSockets](https://img.shields.io/badge/WebSockets-Real--Time-f59e0b?style=flat-square)
![ReportLab](https://img.shields.io/badge/ReportLab-Vector%20PDF-e11d48?style=flat-square)

---

## 1. Project Overview

**NexaMonitor** is an enterprise-grade platform designed for DevOps engineers, software developers, and site reliability teams to monitor, inspect, benchmark, and optimize Docker containers and host infrastructure.

### Complete Feature Matrix (Phases 1 — 7):

1. **Real Docker Engine Integration (Phase 2):**
   - Direct connection to local Docker socket (`unix:///var/run/docker.sock`) or remote TCP/TLS daemon.
   - Live container lifecycle discovery (running, stopped, paused, restarting).
   - Container management operations (start, stop, restart, delete) with safety dialogs.
   - Container inspection and real-time instantaneous stats calculation.

2. **Real-Time Resource Monitoring & WebSockets (Phase 3):**
   - Centralized non-blocking `MonitoringEngine` with async background workers.
   - Differential CPU utilization normalized across online vCPU cores.
   - Differential network speed calculation (`rx_bytes_per_sec`, `tx_bytes_per_sec`, Mbps) with restart/counter-reset safety.
   - Dual-channel WebSockets: `/ws/metrics` (telemetry broadcast every 1s) and `/ws/containers/{id}/logs` (real-time stream).

3. **Persistent Historical Timeseries Analytics (Phase 4):**
   - SQLite timeseries persistence with composite indexing `(container_id, timestamp)`.
   - SQLite Write-Ahead Logging (WAL) mode for non-blocking concurrent reads and batch writes.
   - Flexible bucket aggregation across standard windows (`15m`, `1h`, `6h`, `24h`, `7d`, `30d`) and custom ISO ranges.
   - Cumulative monotonic network and disk volume computation without sum inflation.
   - Automated and manual data retention cleanup (`/api/analytics/retention/cleanup`).

4. **Intelligent Alert Lifecycle & Flapping Protection (Phase 5):**
   - Configurable warning and critical thresholds for CPU, Memory, and Disk.
   - Container lifecycle crash tracking (exit codes) and Docker daemon disconnect detection.
   - Hysteresis recovery thresholds to eliminate alert flapping around boundary conditions.
   - Full alert lifecycle state machine (`ACTIVE` $\to$ `ACKNOWLEDGED` $\to$ `RESOLVED`) with occurrence counters.
   - Container log console with regex severity classification (`CRITICAL`, `ERROR`, `WARN`, `DEBUG`, `INFO`) and text export.

5. **Advanced Multi-Container Benchmarking & Comparisons (Phase 6):**
   - Multi-container selection supporting 2, 3, 4, or up to 6 containers simultaneously.
   - Synchronized timeseries overlay charts for CPU (%), Memory (MB), Network RX (KB/s), and Disk I/O (KB/s).
   - Selected container summary cards with "Highest Consumer" indicator badges.
   - Resource consumption benchmark matrix detailing peak and average utilization across cluster nodes.

6. **Docker Image Lifecycle & Deep Inspection (Phase 6):**
   - Local image registry with in-use status, container counts, and dangling identification.
   - Deep inspection modal detailing layer digests, architecture, OS, entrypoints, commands, environment variables, and labels.
   - Safe deletion with in-use container count warnings and reclaimed disk space calculation.
   - Dangling image pruning endpoint (`POST /api/images/prune?dangling_only=true`).

7. **Container Resource Limits & Cgroup Tuning (Phase 6):**
   - Inspection of host kernel cgroups (`Memory`, `MemoryReservation`, `MemorySwap`, `CpuShares`, `CpuQuota`, `CpuPeriod`).
   - Comparison of configured hardware limits against live real-time utilization.
   - Live resource tuning modal dynamically modifying limits via Docker SDK `container.update()`.

8. **Smart Resource Usage Insights (Phase 6):**
   - Rule-based heuristic intelligence engine detecting:
     - Sustained High CPU Saturation ($>85\%$)
     - Memory Saturation & Near-Limit Exhaustion ($>90\%$)
     - Memory Leak Upward Drift ($+25\%$ continuous climb across hours)
     - Restart Flapping ($\ge 3$ unexpected restarts in 24h)
     - Network Throughput Spikes ($>25\text{ MB/s}$)
     - Idle Container Candidates ($<0.5\%$ CPU, $<2\text{ KB/s}$ network)
   - Actionable recommendations surfaced on Dashboard, Analytics, and Container Detail pages.

9. **Executive Monitoring Reports & Document Generation (Phase 6 & 7):**
   - Daily 24-hour executive performance digests and weekly capacity reports.
   - Custom audit window filtering with datetime pickers.
   - RFC4180-compliant CSV export download (`/api/reports/{type}/export/csv`).
   - Publication-ready vector PDF report export via ReportLab (`/api/reports/{type}/export/pdf`).

10. **Production Deployment & Security Hardening (Phase 7):**
    - Multi-stage `frontend/Dockerfile` serving compiled Vite bundle through Nginx Alpine.
    - Reverse proxy `frontend/nginx.conf` routing `/api` and upgrading `/ws` connections.
    - Containerized `backend/Dockerfile` with healthchecks and persistent storage volume `/data`.
    - Production `docker-compose.yml` with automated service recovery.
    - Full regression test suite: 74 unit/mocked tests + 4 real Docker Desktop integration tests passing.

---

## 2. Technology Stack

### Frontend
- **Framework:** React 18 with TypeScript
- **Tooling & Bundler:** Vite 5
- **Styling:** Tailwind CSS
- **Components:** shadcn/ui & Lucide React
- **Data Visualization:** Recharts
- **Routing:** React Router v6

### Backend
- **Framework:** FastAPI (Python 3.11)
- **Engine Client:** Docker SDK for Python (`docker>=7.1.0`)
- **System Metrics:** psutil
- **Database / ORM:** SQLite with WAL mode & SQLAlchemy 2.0
- **Document Generation:** ReportLab (`reportlab>=4.0.0`)
- **Server:** Uvicorn with WebSockets

### Production Orchestration
- **Deployment:** Docker & Docker Compose
- **Web Server:** Nginx Alpine (Reverse Proxy & Static Asset Caching)

---

## 3. Quick Start & Deployment

### Option A: Production Deployment with Docker Compose (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/your-org/nexamonitor.git
cd nexamonitor

# 2. Configure environment
cp .env.example .env

# 3. Build and launch services in detached mode
docker compose up -d --build
```

Access the application:
- **Web Interface:** `http://localhost:3000` (or `http://localhost:5173`)
- **Backend Swagger UI:** `http://localhost:8000/docs`
- **Health Endpoint:** `http://localhost:8000/api/health`

---

### Option B: Local Development Setup

#### 1. Backend Setup
```bash
cd backend
python3.11 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```
Open `http://localhost:5173` in your browser.

---

## 4. Running the Test Suite

Run the full backend test suite:
```bash
PYTHONPATH=backend backend/venv/bin/pytest backend/tests/ -v
```
*Result: 74 unit and mocked tests passing.*

Run the live Docker Desktop integration tests (requires Docker daemon access):
```bash
PYTHONPATH=backend backend/venv/bin/pytest backend/tests/test_real_docker_integration.py -v
```
*Result: 4 live engine integration tests passing.*

Verify the frontend TypeScript build:
```bash
npm --prefix frontend run build
```
*Result: Vite production build succeeds with 0 errors.*

---

## 5. Documentation Directory

- **System Architecture & Dataflows:** [`ARCHITECTURE.md`](file:///Users/mohtashimali/Downloads/nexamonitor/ARCHITECTURE.md)
- **REST & WebSocket API Reference:** [`API_DOCUMENTATION.md`](file:///Users/mohtashimali/Downloads/nexamonitor/API_DOCUMENTATION.md)
- **Production Deployment Guide:** [`DEPLOYMENT.md`](file:///Users/mohtashimali/Downloads/nexamonitor/DEPLOYMENT.md)
- **Phase 5 Verification Report:** [Phase 5 Report](file:///Users/mohtashimali/.gemini/antigravity/brain/65220c97-5abf-43cd-9b1a-a84518473c8d/Phase5_Completion_Report.md)
- **Phases 6 & 7 Final Completion Report:** [Final Report](file:///Users/mohtashimali/.gemini/antigravity/brain/65220c97-5abf-43cd-9b1a-a84518473c8d/Phase6_7_Completion_Report.md)

---

## 6. License

This project is licensed under the MIT License.
