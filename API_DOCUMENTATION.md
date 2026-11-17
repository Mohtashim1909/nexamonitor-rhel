# NexaMonitor REST & WebSocket API Documentation
**Version:** 7.0.0  
**Base URL:** `http://localhost:8000/api`  
**WebSocket Base:** `ws://localhost:8000/ws`

---

## 1. System & Health Endpoints

### `GET /api/health`
Health probe checking database and Docker engine connectivity status.
- **Response `200 OK`**:
```json
{
  "status": "healthy",
  "version": "7.0.0",
  "docker_connected": true,
  "database_connected": true,
  "timestamp": "2026-11-17T03:30:00Z"
}
```

### `GET /api/docker/status`
Retrieves Docker daemon engine version, OS, container counts, and image counts.

---

## 2. Container Management Endpoints

### `GET /api/containers?all=true`
Lists running and stopped containers with live resource usage.

### `GET /api/containers/{container_id}`
Retrieves detailed container inspect metadata.

### `GET /api/containers/{container_id}/stats`
Instantaneous statistical telemetry snapshot.

### `POST /api/containers/{container_id}/start`
Starts a stopped container.

### `POST /api/containers/{container_id}/stop?timeout=10`
Stops a running container with graceful timeout.

### `POST /api/containers/{container_id}/restart?timeout=10`
Restarts a container.

### `DELETE /api/containers/{container_id}?force=false&v=false`
Deletes a container.

### `GET /api/containers/{container_id}/limits`
Inspects host cgroup limits (CPU quota, shares, memory ceiling, reservations) alongside current live consumption.

### `PUT /api/containers/{container_id}/limits`
Dynamically adjusts container resource limits via Docker SDK `container.update()`.
- **Request Body**:
```json
{
  "mem_limit_bytes": 1073741824,
  "mem_reservation_bytes": 536870912,
  "cpu_shares": 1024,
  "cpu_quota": 100000,
  "cpu_period": 100000,
  "cpuset_cpus": "0,1"
}
```

### `GET /api/containers/{container_id}/logs`
Bounded stdout/stderr log inspection with regex severity classification (`DEBUG`, `INFO`, `WARN`, `ERROR`, `CRITICAL`) and keyword search.

### `GET /api/containers/{container_id}/logs/download`
Downloads container logs as plain text.

---

## 3. Real-Time Telemetry & WebSockets

### `WS /ws/metrics` (or `/ws/monitoring`)
Real-time streaming channel broadcasting synchronized cluster metrics every 1,000ms.
- **Payload Format**:
```json
{
  "type": "metrics_update",
  "timestamp": "2026-11-17T03:30:00Z",
  "containers": [
    {
      "container_id": "c1a2b3c4d5e6",
      "container_name": "backend-worker",
      "status": "running",
      "cpu_usage_percent": 12.4,
      "memory_usage_bytes": 268435456,
      "memory_limit_bytes": 1073741824,
      "memory_usage_percent": 25.0,
      "network_rx_bytes_per_sec": 48120.0,
      "network_tx_bytes_per_sec": 32150.0,
      "network_rx_mbps": 0.385,
      "network_tx_mbps": 0.257,
      "disk_read_bytes_per_sec": 10240.0,
      "disk_write_bytes_per_sec": 4096.0
    }
  ]
}
```

### `WS /ws/containers/{container_id}/logs`
Interactive real-time WebSocket log stream with initial tail replay and live stdout/stderr forwarding.

---

## 4. Historical Telemetry & Analytics Endpoints

### `GET /api/analytics/containers/{container_id}/history`
Historical telemetry points over time ranges (`15m`, `1h`, `6h`, `24h`, `7d`, `30d`).

### `GET /api/analytics/containers/{container_id}/summary`
Computes statistical min, max, avg, and totals for CPU, RAM, Network, and Disk.

### `GET /api/analytics/containers/comparison?container_ids=c1,c2,c3&time_range=24h`
Multi-container benchmark comparison aligning time-series buckets and flagging highest consumers.

### `GET /api/analytics/top-consumers?time_range=24h&metric=cpu&limit=5`
Ranked consumer list for CPU, Memory, Network, or Disk.

---

## 5. Intelligent Alert Management Endpoints

### `GET /api/alerts?status=ACTIVE&severity=critical`
List alert records with status and severity filters.

### `GET /api/alerts/counts`
Returns count of alerts grouped by severity and lifecycle state.

### `POST /api/alerts/{id}/acknowledge`
Transitions alert status to `ACKNOWLEDGED`.

### `POST /api/alerts/acknowledge-all`
Acknowledges all active alerts in bulk.

### `POST /api/alerts/{id}/resolve`
Manually resolves an alert record.

---

## 6. Docker Images Registry Endpoints

### `GET /api/images`
Lists local Docker images with in-use status and dangling indicators.

### `GET /api/images/{image_id}`
Deep image inspection (layers, entrypoint, CMD, architecture, OS, environment variables, labels).

### `POST /api/images/prune?dangling_only=true`
Safely prunes untagged dangling images and returns reclaimed bytes.

### `DELETE /api/images/{image_id}?force=false`
Deletes an image with reclaimed disk space calculation.

---

## 7. Smart Insights & Reporting Endpoints

### `GET /api/insights`
Returns active rule-based resource diagnostics (CPU saturation, Memory saturation, Memory leak drift, Restart flapping, Idle candidates).

### `GET /api/insights/summary`
Returns insight counts grouped by severity and category.

### `POST /api/insights/{id}/dismiss`
Dismisses an insight recommendation from the active UI session.

### `GET /api/reports/daily`
Aggregated 24-hour executive monitoring digest.

### `GET /api/reports/weekly`
Aggregated 7-day capacity and health report.

### `GET /api/reports/custom?start_time={iso}&end_time={iso}`
Custom-window monitoring audit report.

### `GET /api/reports/{report_type}/export/csv`
Downloads RFC4180-compliant CSV audit spreadsheet.

### `GET /api/reports/{report_type}/export/pdf`
Downloads publication-ready PDF report generated via ReportLab.
