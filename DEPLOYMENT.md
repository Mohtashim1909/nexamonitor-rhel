# NexaMonitor Production Deployment Guide
**Monitor. Analyze. Optimize.**

This guide covers deploying NexaMonitor to staging and production environments using Docker Compose, container orchestration best practices, and security hardening.

---

## 1. Quick Start with Docker Compose

Ensure Docker Engine and Docker Compose v2+ are installed on your host machine.

```bash
# 1. Clone repository and navigate to root directory
cd nexamonitor

# 2. Configure environment variables
cp .env.example .env

# 3. Build and launch services in detached mode
docker compose up -d --build
```

Access the application:
- **Web UI:** `http://localhost:3000` (or `http://localhost:5173`)
- **FastAPI Documentation:** `http://localhost:8000/docs`
- **Health Endpoint:** `http://localhost:8000/api/health`

---

## 2. Docker Socket Permissions & Security

NexaMonitor communicates with the host Docker Engine via `/var/run/docker.sock`.

### Linux Host Permissions
On Linux servers, the user executing the backend must have read/write access to the Docker socket. The standard method is ensuring group ownership:

```bash
# Check group ID of docker socket
stat -c '%g' /var/run/docker.sock

# Add backend user or map GID in docker-compose if running as non-root
sudo chmod 660 /var/run/docker.sock
```

### macOS & Docker Desktop
On macOS with Docker Desktop, the socket is managed through the virtualization VM at `/var/run/docker.sock`. Mount `/var/run/docker.sock:/var/run/docker.sock` as specified in `docker-compose.yml`.

### Remote Docker Daemon (TCP/TLS)
To monitor a remote Docker daemon without mounting a local socket, set `DOCKER_HOST`:
```env
DOCKER_HOST=tcp://192.168.1.50:2376
DOCKER_TLS_VERIFY=1
DOCKER_CERT_PATH=/certs
```

---

## 3. High-Concurrency Database Configuration

NexaMonitor uses SQLite with **Write-Ahead Logging (WAL)**:
- Enables non-blocking concurrent reads while background metric persistence batches write every 5 seconds.
- Database file is stored in persistent volume `nexamonitor_storage` mounted at `/data/nexamonitor.db`.
- SQLite connection settings automatically configure:
  ```sql
  PRAGMA journal_mode=WAL;
  PRAGMA busy_timeout=5000;
  PRAGMA synchronous=NORMAL;
  ```

---

## 4. Frontend Reverse Proxy Architecture

The frontend container runs **Nginx Alpine** serving the optimized Vite production bundle:
- All static assets are served with gzip compression and long-term cache headers (`Cache-Control: public, max-age=31536000`).
- `/api/*` routes are proxied to the FastAPI service (`http://backend:8000`).
- `/ws/*` routes are upgraded with `HTTP/1.1 Upgrade: websocket` headers supporting long-lived metric and log streams.

---

## 5. Production Healthchecks & Service Recovery

Both services feature automated health probes:
```yaml
healthcheck:
  test: ["CMD", "curl", "-f", "http://localhost:8000/api/health"]
  interval: 10s
  timeout: 5s
  retries: 3
  start_period: 10s
```
If the backend becomes unresponsive, Docker Compose automatically restarts the container according to `restart: unless-stopped`.
