"""
Docker service - Centralized interface with the Docker daemon.
Provides connection lifecycle, container discovery, metrics calculation,
lifecycle operations, and log streaming with robust error handling.
"""
from typing import List, Dict, Any, Optional
import datetime
import logging
import re
from app.core.config import settings

logger = logging.getLogger(__name__)


LOG_CRITICAL_PATTERN = re.compile(r"\b(CRITICAL|FATAL|PANIC|EMERGENCY)\b", re.IGNORECASE)
LOG_ERROR_PATTERN = re.compile(r"\b(ERROR|ERR|EXCEPTION|TRACEBACK|FAILED|FAILURE)\b", re.IGNORECASE)
LOG_WARN_PATTERN = re.compile(r"\b(WARN|WARNING)\b", re.IGNORECASE)
LOG_DEBUG_PATTERN = re.compile(r"\b(DEBUG|TRACE|DBG)\b", re.IGNORECASE)


def parse_and_classify_log_line(raw_line: str, default_stream: str = "stdout") -> Dict[str, Any]:
    """
    Parse a raw Docker log line into timestamp, severity level, cleaned text, and stream.
    Conservative classification ensures high precision without false alarms.
    """
    line = raw_line.rstrip("\r\n")
    timestamp = None
    message = line

    # Extract RFC3339 timestamp if present (e.g., "2026-11-17T02:40:15.123456789Z ...")
    space_idx = line.find(" ")
    if space_idx > 15:
        candidate_ts = line[:space_idx]
        if ("T" in candidate_ts) and (candidate_ts.endswith("Z") or "+" in candidate_ts or "-" in candidate_ts[10:]):
            timestamp = candidate_ts
            message = line[space_idx + 1 :]

    # Classify severity
    if LOG_CRITICAL_PATTERN.search(message):
        level = "CRITICAL"
    elif LOG_ERROR_PATTERN.search(message):
        level = "ERROR"
    elif LOG_WARN_PATTERN.search(message):
        level = "WARN"
    elif LOG_DEBUG_PATTERN.search(message):
        level = "DEBUG"
    else:
        level = "INFO"

    return {
        "timestamp": timestamp or datetime.datetime.utcnow().isoformat() + "Z",
        "level": level,
        "message": message,
        "raw": line,
        "stream": default_stream,
    }


class DockerService:
    def __init__(self):
        self._client = None
        self._connected = False
        self._last_error: Optional[str] = None
        self._try_connect()

    def _try_connect(self) -> bool:
        """Attempt to connect to the Docker daemon using environment or configured host."""
        try:
            import docker
            # First try from_env
            client = None
            try:
                client = docker.from_env(timeout=settings.DOCKER_TIMEOUT)
                client.ping()
            except Exception as env_err:
                # If from_env fails and a custom DOCKER_HOST is set, try base_url
                if settings.DOCKER_HOST and settings.DOCKER_HOST != "unix:///var/run/docker.sock":
                    client = docker.DockerClient(
                        base_url=settings.DOCKER_HOST,
                        timeout=settings.DOCKER_TIMEOUT
                    )
                    client.ping()
                else:
                    raise env_err

            self._client = client
            self._connected = True
            self._last_error = None
            logger.info("Docker daemon connected successfully")
            return True
        except Exception as e:
            self._client = None
            self._connected = False
            self._last_error = str(e)
            logger.warning(f"Docker daemon connection failed: {e}")
            return False

    def ping(self) -> bool:
        """Verify connection or attempt auto-reconnect if previously disconnected."""
        if self._client is not None:
            try:
                self._client.ping()
                self._connected = True
                self._last_error = None
                return True
            except Exception as e:
                self._connected = False
                self._last_error = str(e)
                self._client = None
                return False
        # Try reconnecting
        return self._try_connect()

    @property
    def is_connected(self) -> bool:
        return self.ping()

    @is_connected.setter
    def is_connected(self, value: bool) -> None:
        self._connected = value

    @property
    def client(self):
        if not self.is_connected:
            return None
        return self._client

    def get_connection_status(self) -> Dict[str, Any]:
        """Return structured Docker connection status and daemon metadata."""
        connected = self.is_connected
        if not connected:
            return {
                "connected": False,
                "server_version": None,
                "api_version": None,
                "operating_system": None,
                "architecture": None,
                "containers_count": None,
                "images_count": None,
                "docker_host": settings.DOCKER_HOST,
                "error": self._last_error or "Docker daemon unavailable or permission denied"
            }

        try:
            version_info = self._client.version()
            info = self._client.info()
            return {
                "connected": True,
                "server_version": version_info.get("Version"),
                "api_version": version_info.get("ApiVersion"),
                "operating_system": info.get("OperatingSystem", version_info.get("Os")),
                "architecture": version_info.get("Arch"),
                "containers_count": info.get("Containers", 0),
                "images_count": info.get("Images", 0),
                "docker_host": settings.DOCKER_HOST,
                "error": None
            }
        except Exception as e:
            logger.error(f"Failed to query Docker version info: {e}")
            return {
                "connected": False,
                "server_version": None,
                "api_version": None,
                "operating_system": None,
                "architecture": None,
                "containers_count": None,
                "images_count": None,
                "docker_host": settings.DOCKER_HOST,
                "error": str(e)
            }

    def get_containers(self, all_containers: bool = True) -> List[Dict[str, Any]]:
        """Retrieve real containers with normalized metadata."""
        if not self.is_connected:
            return []

        try:
            containers = self._client.containers.list(all=all_containers)
            return [self._format_container(c) for c in containers]
        except Exception as e:
            logger.error(f"Failed to list containers: {e}")
            return []

    def get_container(self, container_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a single container by ID or name with complete details."""
        self._validate_container_identifier(container_id)
        if not self.is_connected:
            return None

        container = self._find_docker_container(container_id)
        if not container:
            return None

        return self._format_container(container)

    def _find_docker_container(self, container_id: str):
        """Internal helper to resolve a docker container object by short ID, full ID, or name."""
        if not self.is_connected:
            return None
        try:
            return self._client.containers.get(container_id)
        except Exception:
            # Fallback scan for partial ID match
            try:
                for c in self._client.containers.list(all=True):
                    clean_name = c.name.lstrip("/")
                    if (
                        c.short_id == container_id
                        or c.id.startswith(container_id)
                        or clean_name == container_id.lstrip("/")
                    ):
                        return c
            except Exception as scan_err:
                logger.error(f"Container scan error for {container_id}: {scan_err}")
            return None

    def _format_container(self, container) -> Dict[str, Any]:
        """Convert a Docker SDK Container object into a normalized dictionary."""
        attrs = getattr(container, "attrs", {}) or {}
        state = attrs.get("State", {})
        config = attrs.get("Config", {})
        network_settings = attrs.get("NetworkSettings", {})

        # Resolve image tag and name
        image_name = "unknown"
        image_tag = "latest"
        image_id = attrs.get("Image")
        if container.image and container.image.tags:
            full_tag = container.image.tags[0]
            parts = full_tag.rsplit(":", 1)
            image_name = full_tag
            image_tag = parts[1] if len(parts) > 1 else "latest"
        elif config.get("Image"):
            image_name = config.get("Image")
            parts = image_name.rsplit(":", 1)
            image_tag = parts[1] if len(parts) > 1 else "latest"

        # Resolve exposed ports
        ports_list = []
        port_bindings = network_settings.get("Ports") or {}
        for container_port, host_bindings in port_bindings.items():
            if host_bindings:
                for b in host_bindings:
                    host_ip = b.get("HostIp", "")
                    host_port = b.get("HostPort", "")
                    if host_ip and host_ip != "0.0.0.0":
                        ports_list.append(f"{host_ip}:{host_port}->{container_port}")
                    else:
                        ports_list.append(f"{host_port}->{container_port}")
            else:
                ports_list.append(container_port)

        # Networks info
        networks_data = network_settings.get("Networks", {})
        primary_ip = network_settings.get("IPAddress", "")
        if not primary_ip and networks_data:
            first_net = next(iter(networks_data.values()), {})
            primary_ip = first_net.get("IPAddress", "")

        status_raw = container.status.lower() if container.status else "unknown"
        # Normalize status to expected frontend values
        status = status_raw
        if status_raw in ["dead", "exited"]:
            status = "stopped"

        # Calculate human-readable uptime
        uptime_str = self._calculate_uptime(state)

        return {
            "id": container.short_id,
            "full_id": container.id,
            "name": container.name.lstrip("/"),
            "image": image_name,
            "image_tag": image_tag,
            "image_id": image_id,
            "status": status,
            "state": {
                "status": status_raw,
                "running": state.get("Running", False),
                "paused": state.get("Paused", False),
                "restarting": state.get("Restarting", False),
                "exit_code": state.get("ExitCode", 0),
                "error": state.get("Error", ""),
                "started_at": state.get("StartedAt"),
                "finished_at": state.get("FinishedAt"),
            },
            "created": attrs.get("Created", ""),
            "started_at": state.get("StartedAt"),
            "finished_at": state.get("FinishedAt"),
            "ports": ports_list,
            "network": {
                "ip_address": primary_ip,
                "gateway": network_settings.get("Gateway", ""),
                "networks": list(networks_data.keys()),
            },
            "labels": config.get("Labels") or {},
            "cpu_percent": 0.0,
            "memory_usage": 0.0,
            "memory_limit": 0.0,
            "memory_percent": 0.0,
            "network_rx": 0.0,
            "network_tx": 0.0,
            "uptime": uptime_str,
        }

    def _calculate_uptime(self, state: Dict[str, Any]) -> str:
        """Derive a friendly uptime or status string from container state."""
        if not state:
            return ""

        is_running = state.get("Running", False)
        started_at_str = state.get("StartedAt")
        finished_at_str = state.get("FinishedAt")

        if is_running and started_at_str:
            try:
                # Docker timestamps are RFC3339 / ISO8601 e.g. 2026-11-16T20:26:15.838848594Z
                clean_ts = started_at_str[:26].rstrip("Z")
                started_dt = datetime.datetime.fromisoformat(clean_ts)
                now_dt = datetime.datetime.utcnow()
                diff = now_dt - started_dt
                days = diff.days
                hours, remainder = divmod(diff.seconds, 3600)
                minutes, _ = divmod(remainder, 60)
                if days > 0:
                    return f"Up {days}d {hours}h"
                if hours > 0:
                    return f"Up {hours}h {minutes}m"
                return f"Up {max(minutes, 1)}m"
            except Exception:
                return "Up"

        if finished_at_str and finished_at_str != "0001-01-01T00:00:00Z":
            exit_code = state.get("ExitCode", 0)
            return f"Exited ({exit_code})"

        return state.get("Status", "Stopped")

    def get_container_stats(self, container_id: str) -> Optional[Dict[str, Any]]:
        """
        Collect real container resource statistics.
        Computes accurate CPU %, memory %, I/O ops, and network usage.
        Gracefully handles stopped or paused containers without division by zero.
        """
        self._validate_container_identifier(container_id)
        if not self.is_connected:
            return None

        container = self._find_docker_container(container_id)
        if not container:
            return None

        # Check if container is running
        is_running = container.status.lower() == "running"
        if not is_running:
            return {
                "container_id": container.short_id,
                "container_name": container.name.lstrip("/"),
                "status": container.status,
                "read": datetime.datetime.utcnow().isoformat() + "Z",
                "cpu": {
                    "usage": 0,
                    "percent": 0.0,
                    "system_cpu_usage": 0,
                    "online_cpus": 1,
                },
                "memory": {
                    "usage": 0,
                    "limit": 0,
                    "percent": 0.0,
                    "cache": 0,
                    "stats": {},
                },
                "network": {
                    "rx_bytes": 0,
                    "tx_bytes": 0,
                    "rx_packets": 0,
                    "tx_packets": 0,
                    "rx_errors": 0,
                    "tx_errors": 0,
                    "rx_dropped": 0,
                    "tx_dropped": 0,
                    "interfaces": {},
                },
                "disk_io": {
                    "read_bytes": 0,
                    "write_bytes": 0,
                    "read_ops": 0,
                    "write_ops": 0,
                },
                "pids_current": 0,
            }

        try:
            stats = container.stats(stream=False)
            return self._calculate_stats_payload(container, stats)
        except Exception as e:
            logger.error(f"Failed to calculate stats for {container_id}: {e}")
            return None

    def _calculate_stats_payload(self, container, stats: Dict[str, Any]) -> Dict[str, Any]:
        """Process raw Docker statistics dictionary into normalized metrics."""
        read_time = stats.get("read", "")
        cpu_stats = stats.get("cpu_stats", {})
        precpu_stats = stats.get("precpu_stats", {})
        memory_stats = stats.get("memory_stats", {})
        blkio_stats = stats.get("blkio_stats", {})
        networks = stats.get("networks", {})
        pids_stats = stats.get("pids_stats", {})

        # 1. CPU percentage calculation
        cpu_percent = 0.0
        cpu_usage_total = cpu_stats.get("cpu_usage", {}).get("total_usage", 0)
        precpu_usage_total = precpu_stats.get("cpu_usage", {}).get("total_usage", 0)

        cpu_delta = cpu_usage_total - precpu_usage_total
        system_cpu_usage = cpu_stats.get("system_cpu_usage", 0)
        pre_system_cpu_usage = precpu_stats.get("system_cpu_usage", 0)
        system_delta = system_cpu_usage - pre_system_cpu_usage

        online_cpus = cpu_stats.get("online_cpus")
        if not online_cpus:
            percpu = cpu_stats.get("cpu_usage", {}).get("percpu_usage")
            online_cpus = len(percpu) if percpu else 1

        if system_delta > 0 and cpu_delta > 0:
            cpu_percent = (cpu_delta / system_delta) * online_cpus * 100.0
            cpu_percent = round(min(cpu_percent, online_cpus * 100.0), 2)

        # 2. Memory usage and percent calculation
        raw_mem_usage = memory_stats.get("usage", 0)
        mem_stats_dict = memory_stats.get("stats", {}) or {}
        # Adjust for cache / inactive_file (cgroups v1 vs v2)
        cache_or_inactive = mem_stats_dict.get(
            "inactive_file",
            mem_stats_dict.get("cache", mem_stats_dict.get("total_inactive_file", 0))
        )
        mem_usage = max(0, raw_mem_usage - cache_or_inactive) if raw_mem_usage > cache_or_inactive else raw_mem_usage
        mem_limit = memory_stats.get("limit", 0)
        mem_percent = 0.0
        if mem_limit > 0:
            mem_percent = round((mem_usage / mem_limit) * 100.0, 2)

        # 3. Network stats summation across all interfaces
        net_rx_bytes = 0
        net_tx_bytes = 0
        net_rx_packets = 0
        net_tx_packets = 0
        net_rx_errors = 0
        net_tx_errors = 0
        net_rx_dropped = 0
        net_tx_dropped = 0
        interfaces_data = {}

        if networks:
            for iface_name, iface_stats in networks.items():
                r_bytes = iface_stats.get("rx_bytes", 0)
                t_bytes = iface_stats.get("tx_bytes", 0)
                r_pkts = iface_stats.get("rx_packets", 0)
                t_pkts = iface_stats.get("tx_packets", 0)
                r_errs = iface_stats.get("rx_errors", 0)
                t_errs = iface_stats.get("tx_errors", 0)
                r_drop = iface_stats.get("rx_dropped", 0)
                t_drop = iface_stats.get("tx_dropped", 0)

                net_rx_bytes += r_bytes
                net_tx_bytes += t_bytes
                net_rx_packets += r_pkts
                net_tx_packets += t_pkts
                net_rx_errors += r_errs
                net_tx_errors += t_errs
                net_rx_dropped += r_drop
                net_tx_dropped += t_drop

                interfaces_data[iface_name] = {
                    "rx_bytes": r_bytes,
                    "tx_bytes": t_bytes,
                    "rx_packets": r_pkts,
                    "tx_packets": t_pkts,
                }

        # 4. Block I/O statistics
        io_read_bytes = 0
        io_write_bytes = 0
        io_read_ops = 0
        io_write_ops = 0

        service_bytes = blkio_stats.get("io_service_bytes_recursive") or []
        for entry in service_bytes:
            op = entry.get("op", "").lower()
            val = entry.get("value", 0)
            if op == "read":
                io_read_bytes += val
            elif op == "write":
                io_write_bytes += val

        serviced_ops = blkio_stats.get("io_serviced_recursive") or []
        for entry in serviced_ops:
            op = entry.get("op", "").lower()
            val = entry.get("value", 0)
            if op == "read":
                io_read_ops += val
            elif op == "write":
                io_write_ops += val

        return {
            "container_id": container.short_id,
            "container_name": container.name.lstrip("/"),
            "status": container.status,
            "read": read_time,
            "cpu": {
                "usage": cpu_usage_total,
                "percent": cpu_percent,
                "system_cpu_usage": system_cpu_usage,
                "online_cpus": online_cpus,
            },
            "memory": {
                "usage": mem_usage,
                "limit": mem_limit,
                "percent": mem_percent,
                "cache": cache_or_inactive,
                "stats": mem_stats_dict,
            },
            "network": {
                "rx_bytes": net_rx_bytes,
                "tx_bytes": net_tx_bytes,
                "rx_packets": net_rx_packets,
                "tx_packets": net_tx_packets,
                "rx_errors": net_rx_errors,
                "tx_errors": net_tx_errors,
                "rx_dropped": net_rx_dropped,
                "tx_dropped": net_tx_dropped,
                "interfaces": interfaces_data,
            },
            "disk_io": {
                "read_bytes": io_read_bytes,
                "write_bytes": io_write_bytes,
                "read_ops": io_read_ops,
                "write_ops": io_write_ops,
            },
            "pids_current": pids_stats.get("current", 0),
        }

    # Container Management Operations
    def _validate_container_identifier(self, container_id: str) -> None:
        """Validate container ID or name to prevent malformed or injection inputs."""
        if not container_id or not isinstance(container_id, str):
            raise ValueError("Container ID cannot be empty")
        if not re.match(r"^[a-zA-Z0-9_\-\.]{1,128}$", container_id.strip()):
            raise ValueError("Invalid container identifier format")

    def start_container(self, container_id: str) -> Dict[str, Any]:
        """Start a stopped Docker container."""
        self._validate_container_identifier(container_id)
        if not self.is_connected:
            raise ConnectionError("Docker daemon is not connected")

        container = self._find_docker_container(container_id)
        if not container:
            raise LookupError(f"Container '{container_id}' not found")

        if container.status.lower() == "running":
            return {
                "success": True,
                "action": "start",
                "container_id": container.short_id,
                "message": f"Container '{container.name.lstrip('/')}' is already running"
            }

        container.start()
        container.reload()
        return {
            "success": True,
            "action": "start",
            "container_id": container.short_id,
            "message": f"Container '{container.name.lstrip('/')}' started successfully"
        }

    def stop_container(self, container_id: str, timeout: int = 10) -> Dict[str, Any]:
        """Stop a running Docker container."""
        self._validate_container_identifier(container_id)
        if not self.is_connected:
            raise ConnectionError("Docker daemon is not connected")

        container = self._find_docker_container(container_id)
        if not container:
            raise LookupError(f"Container '{container_id}' not found")

        if container.status.lower() in ["stopped", "exited"]:
            return {
                "success": True,
                "action": "stop",
                "container_id": container.short_id,
                "message": f"Container '{container.name.lstrip('/')}' is already stopped"
            }

        container.stop(timeout=max(1, min(timeout, 60)))
        container.reload()
        return {
            "success": True,
            "action": "stop",
            "container_id": container.short_id,
            "message": f"Container '{container.name.lstrip('/')}' stopped successfully"
        }

    def restart_container(self, container_id: str, timeout: int = 10) -> Dict[str, Any]:
        """Restart a Docker container."""
        self._validate_container_identifier(container_id)
        if not self.is_connected:
            raise ConnectionError("Docker daemon is not connected")

        container = self._find_docker_container(container_id)
        if not container:
            raise LookupError(f"Container '{container_id}' not found")

        container.restart(timeout=max(1, min(timeout, 60)))
        container.reload()
        return {
            "success": True,
            "action": "restart",
            "container_id": container.short_id,
            "message": f"Container '{container.name.lstrip('/')}' restarted successfully"
        }

    def remove_container(self, container_id: str, force: bool = False, v: bool = False) -> Dict[str, Any]:
        """Remove a container instance permanently."""
        self._validate_container_identifier(container_id)
        if not self.is_connected:
            raise ConnectionError("Docker daemon is not connected")

        container = self._find_docker_container(container_id)
        if not container:
            raise LookupError(f"Container '{container_id}' not found")

        name = container.name.lstrip("/")
        short_id = container.short_id
        container.remove(force=force, v=v)
        return {
            "success": True,
            "action": "remove",
            "container_id": short_id,
            "message": f"Container '{name}' removed successfully"
        }

    def get_container_limits(self, container_id: str) -> Dict[str, Any]:
        """Inspect configured CPU and memory resource constraints for a container."""
        self._validate_container_identifier(container_id)
        if not self.is_connected:
            raise ConnectionError("Docker daemon is not connected")

        container = self._find_docker_container(container_id)
        if not container:
            raise LookupError(f"Container '{container_id}' not found")

        host_config = container.attrs.get("HostConfig", {}) or {}

        # CPU config
        cpu_quota = host_config.get("CpuQuota", 0)
        cpu_period = host_config.get("CpuPeriod", 0)
        cpu_shares = host_config.get("CpuShares", 0)
        nano_cpus = host_config.get("NanoCpus", 0)

        # Calculate effective CPU limit (e.g. quota/period)
        effective_cpus = None
        if nano_cpus and nano_cpus > 0:
            effective_cpus = round(nano_cpus / 1e9, 2)
        elif cpu_quota and cpu_period and cpu_period > 0 and cpu_quota > 0:
            effective_cpus = round(cpu_quota / cpu_period, 2)

        # Memory config
        mem_limit = host_config.get("Memory", 0)
        mem_reservation = host_config.get("MemoryReservation", 0)
        mem_swap = host_config.get("MemorySwap", 0)

        # Live stats snapshot if running
        live_cpu_percent = 0.0
        live_mem_usage = 0
        live_mem_percent = 0.0
        try:
            if getattr(container, "status", "") == "running":
                stats = self.get_container_stats(container_id)
                if stats:
                    live_cpu_percent = stats.get("cpu", {}).get("percent", 0.0)
                    live_mem_usage = stats.get("memory", {}).get("usage", 0)
                    live_mem_percent = stats.get("memory", {}).get("percent", 0.0)
        except Exception:
            pass

        cid_short = getattr(container, "short_id", "") or (container.id[:12] if getattr(container, "id", None) else container_id)
        cname = getattr(container, "name", "").lstrip("/") if getattr(container, "name", None) else container_id
        cstatus = getattr(container, "status", "unknown")

        return {
            "container_id": cid_short,
            "container_name": cname,
            "status": cstatus,
            "memory_limit_bytes": mem_limit,
            "memory_limit_mb": round(mem_limit / (1024 * 1024), 2) if mem_limit else 0.0,
            "memory_reservation_bytes": mem_reservation,
            "memory_reservation_mb": round(mem_reservation / (1024 * 1024), 2) if mem_reservation else 0.0,
            "memory_swap_bytes": mem_swap,
            "memory_swap_mb": round(mem_swap / (1024 * 1024), 2) if mem_swap else 0.0,
            "cpu_shares": cpu_shares,
            "cpu_quota": cpu_quota,
            "cpu_period": cpu_period,
            "effective_cpus": effective_cpus or 0.0,
            "live_memory_usage_mb": round(live_mem_usage / (1024 * 1024), 2) if live_mem_usage else 0.0,
            "live_memory_percent": live_mem_percent,
            "live_cpu_percent": live_cpu_percent,
            "cpu": {
                "quota": cpu_quota,
                "period": cpu_period,
                "shares": cpu_shares,
                "nano_cpus": nano_cpus,
                "effective_cpus": effective_cpus,
                "current_percent": live_cpu_percent,
            },
            "memory": {
                "limit_bytes": mem_limit,
                "reservation_bytes": mem_reservation,
                "swap_bytes": mem_swap,
                "current_usage_bytes": live_mem_usage,
                "current_percent": live_mem_percent,
                "is_unlimited": (mem_limit == 0 or mem_limit > 1_000_000_000_000_000),
            },
            "update_supported": True,
        }

    def update_container_limits(
        self,
        container_id: str,
        mem_limit_bytes: Optional[int] = None,
        mem_reservation_bytes: Optional[int] = None,
        cpu_quota: Optional[int] = None,
        cpu_period: Optional[int] = None,
        cpu_shares: Optional[int] = None,
        cpuset_cpus: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Dynamically update resource limits for an existing container using Docker SDK."""
        self._validate_container_identifier(container_id)
        if not self.is_connected:
            raise ConnectionError("Docker daemon is not connected")

        container = self._find_docker_container(container_id)
        if not container:
            raise LookupError(f"Container '{container_id}' not found")

        update_kwargs: Dict[str, Any] = {}
        if mem_limit_bytes is not None and mem_limit_bytes >= 0:
            update_kwargs["mem_limit"] = mem_limit_bytes
        if mem_reservation_bytes is not None and mem_reservation_bytes >= 0:
            update_kwargs["mem_reservation"] = mem_reservation_bytes
        if cpu_quota is not None and cpu_quota >= 0:
            update_kwargs["cpu_quota"] = cpu_quota
        if cpu_period is not None and cpu_period >= 0:
            update_kwargs["cpu_period"] = cpu_period
        if cpu_shares is not None and cpu_shares >= 0:
            update_kwargs["cpu_shares"] = cpu_shares
        if cpuset_cpus is not None:
            update_kwargs["cpuset_cpus"] = cpuset_cpus

        if not update_kwargs:
            raise ValueError("No valid resource limit updates provided")

        try:
            container.update(**update_kwargs)
            container.reload()
            return {
                "success": True,
                "container_id": container.short_id,
                "updated_limits": update_kwargs,
                "message": f"Resource limits updated successfully for '{container.name.lstrip('/')}'",
            }
        except Exception as e:
            err_msg = str(e)
            logger.warning(f"Docker limit update error on {container_id}: {err_msg}")
            if "not supported" in err_msg.lower() or "cgroups" in err_msg.lower() or "cannot update" in err_msg.lower():
                raise ValueError(f"Docker Engine constraint: {err_msg}. Note that certain limits can only be specified during container creation.")
            raise RuntimeError(f"Docker resource update failed: {err_msg}")

    def get_container_logs(
        self,
        container_id: str,
        tail: int = 100,
        timestamps: bool = True,
        stdout: bool = True,
        stderr: bool = True,
        since: Optional[int] = None,
        until: Optional[int] = None,
        search: Optional[str] = None,
        level: Optional[str] = None,
    ) -> List[str]:
        """Retrieve container stdout and stderr logs."""
        self._validate_container_identifier(container_id)
        if not self.is_connected:
            raise ConnectionError("Docker daemon is not connected")

        container = self._find_docker_container(container_id)
        if not container:
            raise LookupError(f"Container '{container_id}' not found")

        bounded_tail = max(1, min(tail, 2000))
        kwargs: Dict[str, Any] = {
            "tail": bounded_tail,
            "timestamps": timestamps,
            "stdout": stdout,
            "stderr": stderr,
            "stream": False,
        }
        if since is not None:
            kwargs["since"] = since
        if until is not None:
            kwargs["until"] = until

        raw = container.logs(**kwargs)
        if isinstance(raw, bytes):
            text = raw.decode("utf-8", errors="replace")
            raw_lines = text.splitlines()
        elif isinstance(raw, str):
            raw_lines = raw.splitlines()
        else:
            raw_lines = [str(line) for line in raw]

        level_filter = level.upper() if level and level.upper() != "ALL" else None
        search_filter = search.strip().lower() if search and search.strip() else None

        if not level_filter and not search_filter:
            return raw_lines

        filtered: List[str] = []
        for line in raw_lines:
            entry = parse_and_classify_log_line(line)
            if level_filter:
                if level_filter == "WARN" and entry["level"] not in ("WARN", "WARNING"):
                    continue
                elif level_filter != "WARN" and entry["level"] != level_filter:
                    continue
            if search_filter:
                if (
                    search_filter not in entry["message"].lower()
                    and search_filter not in entry["level"].lower()
                ):
                    continue
            filtered.append(line)
        return filtered

    def get_structured_container_logs(
        self,
        container_id: str,
        tail: int = 100,
        timestamps: bool = True,
        stdout: bool = True,
        stderr: bool = True,
        since: Optional[int] = None,
        until: Optional[int] = None,
        search: Optional[str] = None,
        level: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Retrieve container logs classified by severity level with search filtering."""
        lines = self.get_container_logs(
            container_id=container_id,
            tail=tail,
            timestamps=timestamps,
            stdout=stdout,
            stderr=stderr,
            since=since,
            until=until,
            search=search,
            level=level,
        )
        entries = [parse_and_classify_log_line(line) for line in lines]
        c_name = container_id
        try:
            container = self._find_docker_container(container_id)
            if container and hasattr(container, "name"):
                c_name = container.name.lstrip("/")
        except Exception:
            pass

        return {
            "container_id": container_id,
            "container_name": c_name,
            "total_lines": len(lines),
            "filtered_lines": len(lines),
            "lines": lines,
            "entries": entries,
        }

    def stream_logs_iterator(
        self,
        container_id: str,
        tail: int = 50,
        timestamps: bool = True,
        stdout: bool = True,
        stderr: bool = True,
        since: Optional[int] = None,
    ):
        """Yield live streaming log lines from Docker socket."""
        self._validate_container_identifier(container_id)
        if not self.is_connected:
            raise ConnectionError("Docker daemon is not connected")

        container = self._find_docker_container(container_id)
        if not container:
            raise LookupError(f"Container '{container_id}' not found")

        kwargs = {
            "stream": True,
            "follow": True,
            "tail": max(1, min(tail, 500)),
            "timestamps": timestamps,
            "stdout": stdout,
            "stderr": stderr,
        }
        if since is not None:
            kwargs["since"] = since

        return container.logs(**kwargs)


docker_service = DockerService()
