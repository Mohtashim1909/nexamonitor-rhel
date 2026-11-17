import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  useRef,
  ReactNode,
} from 'react';
import type {
  SystemMetrics,
  Alert,
  Container,
  DockerStatus,
  ContainerActionResponse,
  LiveContainerMetric,
  WebSocketStatus,
  ChartDataPoint,
} from '@/types';
import { DEMO_SYSTEM_METRICS, DEMO_ALERTS, DEMO_CONTAINERS } from '@/data/demo';
import { api } from '@/services/api';
import { wsService } from '@/services/websocket';

interface AppContextValue {
  sidebarCollapsed: boolean;
  toggleSidebar: () => void;
  systemMetrics: SystemMetrics;
  alerts: Alert[];
  containers: Container[];
  backendConnected: boolean;
  dockerStatus: DockerStatus | null;
  dockerError: string | null;
  isDemoMode: boolean;
  setDemoMode: (val: boolean) => void;
  toggleDemoMode: () => void;
  acknowledgeAlert: (id: number) => void;
  resolveAlert: (id: number) => void;
  acknowledgeAllAlerts: () => void;
  refreshData: () => Promise<void>;
  startContainer: (id: string) => Promise<ContainerActionResponse>;
  stopContainer: (id: string, timeout?: number) => Promise<ContainerActionResponse>;
  restartContainer: (id: string, timeout?: number) => Promise<ContainerActionResponse>;
  removeContainer: (id: string, force?: boolean) => Promise<ContainerActionResponse>;
  // Phase 3 Real-time additions
  wsStatus: WebSocketStatus;
  liveMetrics: Record<string, LiveContainerMetric>;
  monitoringInterval: number;
  setMonitoringInterval: (intervalMs: number) => Promise<void>;
  lastMetricTime: string | null;
  chartHistory: ChartDataPoint[];
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>(DEMO_ALERTS);
  const [containers, setContainers] = useState<Container[]>(DEMO_CONTAINERS);
  const [systemMetrics, setSystemMetrics] = useState<SystemMetrics>(DEMO_SYSTEM_METRICS);
  const [backendConnected, setBackendConnected] = useState(false);
  const [dockerStatus, setDockerStatus] = useState<DockerStatus | null>(null);
  const [dockerError, setDockerError] = useState<string | null>(null);

  // Phase 3 real-time states
  const [wsStatus, setWsStatus] = useState<WebSocketStatus>('DISCONNECTED');
  const [liveMetrics, setLiveMetrics] = useState<Record<string, LiveContainerMetric>>({});
  const [monitoringInterval, setMonitoringIntervalState] = useState<number>(1000);
  const [lastMetricTime, setLastMetricTime] = useState<string | null>(null);
  const [chartHistory, setChartHistory] = useState<ChartDataPoint[]>([]);

  const isDemoModeRef = useRef<boolean>(true);

  // Initialize demo mode
  const [isDemoMode, setIsDemoMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('nexamonitor_mode');
    const val = saved !== null ? saved === 'demo' : true;
    isDemoModeRef.current = val;
    return val;
  });

  const toggleSidebar = useCallback(() => setSidebarCollapsed((p) => !p), []);

  const setDemoMode = useCallback((val: boolean) => {
    setIsDemoMode(val);
    isDemoModeRef.current = val;
    localStorage.setItem('nexamonitor_mode', val ? 'demo' : 'live');
    if (val) {
      wsService.disconnect();
    } else {
      wsService.connect();
    }
  }, []);

  const toggleDemoMode = useCallback(() => {
    setIsDemoMode((prev) => {
      const next = !prev;
      isDemoModeRef.current = next;
      localStorage.setItem('nexamonitor_mode', next ? 'demo' : 'live');
      if (next) {
        wsService.disconnect();
      } else {
        wsService.connect();
      }
      return next;
    });
  }, []);

  const acknowledgeAlert = useCallback((id: number) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, is_acknowledged: true, status: 'ACKNOWLEDGED', acknowledged_at: new Date().toISOString() }
          : a
      )
    );
    api.alerts.acknowledge(id).catch(() => {});
  }, []);

  const resolveAlert = useCallback((id: number) => {
    setAlerts((prev) =>
      prev.map((a) =>
        a.id === id
          ? { ...a, status: 'RESOLVED', resolved_at: new Date().toISOString() }
          : a
      )
    );
    api.alerts.resolve(id).catch(() => {});
  }, []);

  const acknowledgeAllAlerts = useCallback(() => {
    const nowIso = new Date().toISOString();
    setAlerts((prev) =>
      prev.map((a) =>
        !a.is_acknowledged
          ? { ...a, is_acknowledged: true, status: 'ACKNOWLEDGED', acknowledged_at: nowIso }
          : a
      )
    );
    api.alerts.acknowledgeAll().catch(() => {});
  }, []);

  // Update monitoring interval
  const setMonitoringInterval = useCallback(async (intervalMs: number) => {
    setMonitoringIntervalState(intervalMs);
    try {
      await api.monitoring.updateSettings(intervalMs);
      wsService.send('set_interval', { interval_ms: intervalMs });
    } catch (e) {
      console.warn('Failed to persist monitoring interval to backend', e);
    }
  }, []);

  // Sync background status check
  const refreshData = useCallback(async () => {
    // 1. Check backend health
    let isHealthy = false;
    try {
      const health = await api.health();
      if (health && health.status === 'healthy') {
        setBackendConnected(true);
        isHealthy = true;
      } else {
        setBackendConnected(false);
      }
    } catch {
      setBackendConnected(false);
      setDockerStatus(null);
      setDockerError('FastAPI backend is offline (http://localhost:8000)');
    }

    // 2. Check Docker connection status from backend
    let currentDockerConnected = false;
    if (isHealthy) {
      try {
        const dStatus = await api.docker.status();
        setDockerStatus(dStatus);
        currentDockerConnected = dStatus.connected;
        if (!dStatus.connected) {
          setDockerError(dStatus.error || 'Docker engine is not connected');
        } else {
          setDockerError(null);
        }
      } catch (err: any) {
        setDockerStatus({
          connected: false,
          error: err?.message || 'Failed to query Docker status',
        });
        setDockerError(err?.message || 'Failed to query Docker status');
      }
    }

    // 3. Populate baseline data according to Mode
    if (isDemoModeRef.current) {
      setContainers(DEMO_CONTAINERS);
      setAlerts(DEMO_ALERTS);
      setSystemMetrics(DEMO_SYSTEM_METRICS);
    } else {
      if (isHealthy && currentDockerConnected) {
        try {
          const liveContainers = await api.containers.list(true);
          setContainers((prevContainers) => {
            if (!liveContainers) return [];
            // Preserve real-time metrics attached to live container instances
            return liveContainers.map((lc) => {
              const existing = prevContainers.find((p) => p.id === lc.id);
              return {
                ...lc,
                cpu_percent: existing?.cpu_percent ?? lc.cpu_percent,
                memory_usage: existing?.memory_usage ?? lc.memory_usage,
                memory_percent: existing?.memory_percent ?? lc.memory_percent,
                network_rx: existing?.network_rx ?? lc.network_rx,
                network_tx: existing?.network_tx ?? lc.network_tx,
                network_rx_bytes_per_sec: existing?.network_rx_bytes_per_sec ?? 0,
                network_tx_bytes_per_sec: existing?.network_tx_bytes_per_sec ?? 0,
                network_rx_mbps: existing?.network_rx_mbps ?? 0,
                network_tx_mbps: existing?.network_tx_mbps ?? 0,
                is_monitored: lc.status === 'running',
              };
            });
          });
        } catch (err: any) {
          setContainers([]);
          setDockerError(err?.message || 'Failed to retrieve live containers');
        }

        try {
          const liveAlerts = await api.alerts.list();
          setAlerts(liveAlerts || []);
        } catch {
          // Keep prior alerts
        }
      } else {
        setContainers([]);
      }
    }
  }, []);

  // Periodic container discovery / status sync
  useEffect(() => {
    refreshData();
    const interval = setInterval(refreshData, 6000);
    return () => clearInterval(interval);
  }, [refreshData]);

  // WebSocket Subscription for Real-time metrics
  useEffect(() => {
    const unsubStatus = wsService.onStatusChange((s) => {
      setWsStatus(s);
    });

    if (!isDemoMode) {
      wsService.connect();
    } else {
      wsService.disconnect();
    }

    // Handle batch metrics update
    const unsubMetrics = wsService.on('containers_metrics', (data: any) => {
      if (isDemoModeRef.current || !data) return;

      const cList: LiveContainerMetric[] = data.containers || [];
      const sysMetrics = data.system;
      const timeStr = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

      setLastMetricTime(data.timestamp || new Date().toISOString());

      // Update Live metrics dictionary
      const map: Record<string, LiveContainerMetric> = {};
      let totalCpu = 0;
      let totalMem = 0;
      let totalRxRate = 0;
      let totalTxRate = 0;

      cList.forEach((metric) => {
        map[metric.container_id] = metric;
        totalCpu += metric.cpu_usage_percent;
        totalMem += metric.memory_usage_bytes;
        totalRxRate += metric.network_rx_bytes_per_sec || 0;
        totalTxRate += metric.network_tx_bytes_per_sec || 0;
      });
      setLiveMetrics(map);

      // Dynamically update container list with live values
      setContainers((prev) =>
        prev.map((c) => {
          const live = map[c.id];
          if (!live) return c;
          return {
            ...c,
            cpu_percent: live.cpu_usage_percent,
            memory_usage: live.memory_usage_bytes,
            memory_limit: live.memory_limit_bytes,
            memory_percent: live.memory_usage_percent,
            network_rx: live.network_rx_bytes,
            network_tx: live.network_tx_bytes,
            network_rx_bytes_per_sec: live.network_rx_bytes_per_sec,
            network_tx_bytes_per_sec: live.network_tx_bytes_per_sec,
            network_rx_mbps: live.network_rx_mbps,
            network_tx_mbps: live.network_tx_mbps,
            last_updated: live.timestamp,
            is_monitored: live.status === 'running',
          };
        })
      );

      // Update host system metrics if broadcast
      if (sysMetrics && sysMetrics.cpu) {
        setSystemMetrics(sysMetrics);
      }

      // Append point to bounded in-memory chart history (keep last 60 points)
      setChartHistory((prevHistory) => {
        const point: ChartDataPoint = {
          time: timeStr,
          cpu: Math.round(totalCpu * 10) / 10,
          memory: Math.round((totalMem / (1024 * 1024)) * 10) / 10, // MB
          rx_rate: Math.round(totalRxRate / 1024), // KB/s
          tx_rate: Math.round(totalTxRate / 1024), // KB/s
        };
        // Also attach per-container values for multi-series charts
        cList.forEach((c) => {
          point[`cpu_${c.container_id}`] = c.cpu_usage_percent;
          point[`mem_${c.container_id}`] = Math.round((c.memory_usage_bytes / (1024 * 1024)) * 10) / 10;
        });

        const next = [...prevHistory, point];
        return next.length > 60 ? next.slice(next.length - 60) : next;
      });
    });

    // Handle real-time alert events
    const unsubAlertCreated = wsService.on('alert_created', (data: any) => {
      if (isDemoModeRef.current || !data) return;
      setAlerts((prev) => {
        const idx = prev.findIndex((a) => a.id === data.id);
        if (idx >= 0) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...data };
          return updated;
        }
        return [data, ...prev];
      });
    });

    const unsubAlertAck = wsService.on('alert_acknowledged', (data: any) => {
      if (isDemoModeRef.current || !data) return;
      setAlerts((prev) =>
        prev.map((a) => (a.id === data.id ? { ...a, ...data, is_acknowledged: true, status: 'ACKNOWLEDGED' } : a))
      );
    });

    const unsubAlertResolved = wsService.on('alert_resolved', (data: any) => {
      if (isDemoModeRef.current || !data) return;
      setAlerts((prev) =>
        prev.map((a) => (a.id === data.id ? { ...a, ...data, status: 'RESOLVED' } : a))
      );
    });

    return () => {
      unsubStatus();
      unsubMetrics();
      unsubAlertCreated();
      unsubAlertAck();
      unsubAlertResolved();
      wsService.disconnect();
    };
  }, [isDemoMode]);

  // Lifecycle actions
  const startContainer = useCallback(
    async (id: string): Promise<ContainerActionResponse> => {
      if (isDemoMode) {
        setContainers((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: 'running' as const } : c))
        );
        return {
          success: true,
          action: 'start',
          container_id: id,
          message: `[DEMO] Container started successfully`,
        };
      }
      const res = await api.containers.start(id);
      await refreshData();
      return res;
    },
    [isDemoMode, refreshData]
  );

  const stopContainer = useCallback(
    async (id: string, timeout = 10): Promise<ContainerActionResponse> => {
      if (isDemoMode) {
        setContainers((prev) =>
          prev.map((c) => (c.id === id ? { ...c, status: 'stopped' as const } : c))
        );
        return {
          success: true,
          action: 'stop',
          container_id: id,
          message: `[DEMO] Container stopped successfully`,
        };
      }
      const res = await api.containers.stop(id, timeout);
      await refreshData();
      return res;
    },
    [isDemoMode, refreshData]
  );

  const restartContainer = useCallback(
    async (id: string, timeout = 10): Promise<ContainerActionResponse> => {
      if (isDemoMode) {
        return {
          success: true,
          action: 'restart',
          container_id: id,
          message: `[DEMO] Container restarted successfully`,
        };
      }
      const res = await api.containers.restart(id, timeout);
      await refreshData();
      return res;
    },
    [isDemoMode, refreshData]
  );

  const removeContainer = useCallback(
    async (id: string, force = false): Promise<ContainerActionResponse> => {
      if (isDemoMode) {
        setContainers((prev) => prev.filter((c) => c.id !== id));
        return {
          success: true,
          action: 'remove',
          container_id: id,
          message: `[DEMO] Container removed successfully`,
        };
      }
      const res = await api.containers.remove(id, force);
      await refreshData();
      return res;
    },
    [isDemoMode, refreshData]
  );

  return (
    <AppContext.Provider
      value={{
        sidebarCollapsed,
        toggleSidebar,
        systemMetrics,
        alerts,
        containers,
        backendConnected,
        dockerStatus,
        dockerError,
        isDemoMode,
        setDemoMode,
        toggleDemoMode,
        acknowledgeAlert,
        resolveAlert,
        acknowledgeAllAlerts,
        refreshData,
        startContainer,
        stopContainer,
        restartContainer,
        removeContainer,
        wsStatus,
        liveMetrics,
        monitoringInterval,
        setMonitoringInterval,
        lastMetricTime,
        chartHistory,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
