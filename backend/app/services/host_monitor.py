"""Host monitoring service using psutil."""
import psutil
import platform
from datetime import datetime
from typing import Dict, Any


class HostMonitor:
    def get_system_info(self) -> Dict[str, Any]:
        return {
            "hostname": platform.node(),
            "os": f"{platform.system()} {platform.release()}",
            "architecture": platform.machine(),
            "python_version": platform.python_version(),
            "boot_time": datetime.fromtimestamp(psutil.boot_time()).isoformat(),
            "uptime_seconds": (datetime.now() - datetime.fromtimestamp(psutil.boot_time())).total_seconds()
        }

    def get_cpu_info(self) -> Dict[str, Any]:
        freq = 0
        try:
            f = psutil.cpu_freq()
            if f and hasattr(f, 'current') and f.current:
                freq = f.current
        except Exception:
            freq = 0

        return {
            "percent": psutil.cpu_percent(interval=None),
            "count_logical": psutil.cpu_count(logical=True) or 1,
            "count_physical": psutil.cpu_count(logical=False) or 1,
            "freq_current": freq,
            "per_cpu": psutil.cpu_percent(interval=None, percpu=True)
        }

    def get_memory_info(self) -> Dict[str, Any]:
        mem = psutil.virtual_memory()
        swap = psutil.swap_memory()
        return {
            "total": mem.total,
            "available": mem.available,
            "used": mem.used,
            "percent": mem.percent,
            "swap_total": swap.total,
            "swap_used": swap.used,
            "swap_percent": swap.percent
        }

    def get_disk_info(self) -> Dict[str, Any]:
        path = "C:\\" if platform.system() == "Windows" else "/"
        disk = psutil.disk_usage(path)
        io = psutil.disk_io_counters()
        return {
            "total": disk.total,
            "used": disk.used,
            "free": disk.free,
            "percent": disk.percent,
            "read_bytes": io.read_bytes if io else 0,
            "write_bytes": io.write_bytes if io else 0
        }

    def get_network_info(self) -> Dict[str, Any]:
        net = psutil.net_io_counters()
        return {
            "bytes_sent": net.bytes_sent,
            "bytes_recv": net.bytes_recv,
            "packets_sent": net.packets_sent,
            "packets_recv": net.packets_recv,
        }

    def get_full_snapshot(self) -> Dict[str, Any]:
        return {
            "system": self.get_system_info(),
            "cpu": self.get_cpu_info(),
            "memory": self.get_memory_info(),
            "disk": self.get_disk_info(),
            "network": self.get_network_info(),
            "timestamp": datetime.utcnow().isoformat()
        }


host_monitor = HostMonitor()
