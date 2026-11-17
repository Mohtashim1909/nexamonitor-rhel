import React, { useMemo, useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  Play,
  Square,
  RotateCcw,
  Cpu,
  MemoryStick,
  Network,
  Clock,
  Layers,
  Hash,
  HardDrive,
  Terminal,
  Shield,
  Tag,
  Boxes,
  RefreshCw,
  Activity,
  Database,
  Calendar,
  Sliders,
  SlidersHorizontal,
  Lightbulb,
  Save,
  AlertTriangle,
  CheckCircle,
} from 'lucide-react';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { MetricCard } from '@/components/shared/MetricCard';
import { AreaChart } from '@/components/charts/AreaChart';
import { LineChart } from '@/components/charts/LineChart';
import { DemoModeBanner, LiveModeBanner } from '@/components/shared/DemoModeBanner';
import { EmptyState } from '@/components/shared/EmptyState';
import { useApp } from '@/context/AppContext';
import { formatBytes, formatPercent } from '@/utils/format';
import { generateContainerMetricSeries, generateNetworkSeries } from '@/data/demo';
import { api } from '@/services/api';
import { clsx } from 'clsx';
import type {
  ContainerStats,
  TimeRange,
  MetricHistoryPoint,
  ContainerSummaryResponse,
  ContainerLimits,
  ResourceInsight,
} from '@/types';

export function ContainerDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    containers,
    isDemoMode,
    startContainer,
    stopContainer,
    restartContainer,
    liveMetrics,
    wsStatus,
  } = useApp();
  const [activeTab, setActiveTab] = useState<'metrics' | 'limits' | 'insights' | 'config' | 'logs'>('metrics');
  const [feedback, setFeedback] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState(false);

  // Fallback direct stats and logs
  const [liveStats, setLiveStats] = useState<ContainerStats | null>(null);
  const [liveLogs, setLiveLogs] = useState<string[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [containerHistory, setContainerHistory] = useState<any[]>([]);

  // Phase 6 Limits & Insights States
  const [containerLimits, setContainerLimits] = useState<ContainerLimits | null>(null);
  const [limitsLoading, setLimitsLoading] = useState(false);
  const [limitsModalOpen, setLimitsModalOpen] = useState(false);
  const [editMemMb, setEditMemMb] = useState<string>('');
  const [editCpuShares, setEditCpuShares] = useState<string>('');
  const [editCpus, setEditCpus] = useState<string>('');
  const [updatingLimits, setUpdatingLimits] = useState(false);
  const [limitsNotice, setLimitsNotice] = useState<string | null>(null);
  const [containerInsights, setContainerInsights] = useState<ResourceInsight[]>([]);

  // Phase 4 Historical telemetry states
  const [chartViewMode, setChartViewMode] = useState<'historical' | 'realtime'>('historical');
  const [histTimeRange, setHistTimeRange] = useState<TimeRange>('24h');
  const [dbHistory, setDbHistory] = useState<MetricHistoryPoint[]>([]);
  const [dbSummary, setDbSummary] = useState<ContainerSummaryResponse | null>(null);
  const [histLoading, setHistLoading] = useState(false);

  const container = containers.find((c) => c.id === id || c.id.startsWith(id || ''));
  const currentLive = container ? liveMetrics[container.id] : undefined;

  // Stream in-memory chart history for this container
  useEffect(() => {
    if (isDemoMode || !currentLive) return;

    const timeStr = new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });

    setContainerHistory((prev) => {
      const point = {
        time: timeStr,
        cpu: currentLive.cpu_usage_percent,
        memory: currentLive.memory_usage_percent,
        network_rx: Math.round((currentLive.network_rx_bytes_per_sec || 0) / 1024), // KB/s
        network_tx: Math.round((currentLive.network_tx_bytes_per_sec || 0) / 1024), // KB/s
      };
      const next = [...prev, point];
      return next.length > 60 ? next.slice(next.length - 60) : next;
    });
  }, [isDemoMode, currentLive]);

  // Phase 4: Fetch historical metrics and summary from SQLite in LIVE mode
  useEffect(() => {
    if (isDemoMode || !container) return;

    let mounted = true;
    setHistLoading(true);

    Promise.all([
      api.analytics.history(container.id, { time_range: histTimeRange }),
      api.analytics.summary(container.id, { time_range: histTimeRange }),
    ])
      .then(([h, s]) => {
        if (mounted) {
          setDbHistory(h.points || []);
          setDbSummary(s);
          setHistLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          console.debug('Failed to load container historical telemetry:', err);
          setHistLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [isDemoMode, container?.id, histTimeRange]);

  // Initial stats fetch if WebSocket hasn't delivered yet
  useEffect(() => {
    if (isDemoMode || !container || currentLive) return;

    let mounted = true;
    api.containers
      .stats(container.id)
      .then((s) => {
        if (mounted) setLiveStats(s);
      })
      .catch(() => {});

    return () => {
      mounted = false;
    };
  }, [isDemoMode, container?.id, currentLive]);

  // Live logs fetching when logs tab is active
  useEffect(() => {
    if (isDemoMode || !container || activeTab !== 'logs') return;

    let mounted = true;
    setLogsLoading(true);
    api.containers
      .logs(container.id, 60, true)
      .then((res) => {
        if (mounted) setLiveLogs(res.lines || []);
      })
      .catch((err) => {
        if (mounted) setLiveLogs([`[Error fetching logs]: ${err?.message || err}`]);
      })
      .finally(() => {
        if (mounted) setLogsLoading(false);
      });

    return () => {
      mounted = false;
    };
  }, [isDemoMode, container?.id, activeTab]);

  // Phase 6: Load Limits and Insights for this container
  const fetchLimits = () => {
    if (!container) return;
    if (isDemoMode) {
      setContainerLimits({
        container_id: container.id,
        container_name: container.name,
        memory_limit_bytes: 1073741824,
        memory_limit_mb: 1024,
        memory_reservation_bytes: 536870912,
        memory_reservation_mb: 512,
        memory_swap_bytes: 2147483648,
        memory_swap_mb: 2048,
        cpu_shares: 1024,
        cpu_quota: 100000,
        cpu_period: 100000,
        nano_cpus: 1000000000,
        effective_cpus: 1.0,
        live_memory_usage_mb: 215.4,
        live_memory_percent: 21.0,
        live_cpu_percent: 3.2,
        update_supported: true,
      });
      return;
    }

    setLimitsLoading(true);
    api.containers
      .getLimits(container.id)
      .then((data) => {
        setContainerLimits(data);
        if (data.memory_limit_mb && data.memory_limit_mb < 500000) {
          setEditMemMb(String(Math.round(data.memory_limit_mb)));
        }
        if (data.cpu_shares) {
          setEditCpuShares(String(data.cpu_shares));
        }
        if (data.effective_cpus) {
          setEditCpus(String(data.effective_cpus));
        }
      })
      .catch((err) => {
        console.debug('Failed to get container limits:', err);
      })
      .finally(() => {
        setLimitsLoading(false);
      });
  };

  useEffect(() => {
    if (!container) return;
    fetchLimits();

    if (!isDemoMode) {
      api.insights
        .list({ container_id: container.id })
        .then((items) => setContainerInsights(items || []))
        .catch(() => setContainerInsights([]));
    } else {
      setContainerInsights([
        {
          id: `demo-insight-${container.id}`,
          rule_id: 'MEM_STABLE',
          container_id: container.id,
          container_name: container.name,
          category: 'memory',
          severity: 'info',
          title: 'Optimal Memory Footprint',
          description: 'Memory usage is stable within normal baseline bounds.',
          recommendation: 'No allocation adjustment needed at this time.',
          metrics: { memory_percent: 21.0 },
          detected_at: new Date().toISOString(),
        },
      ]);
    }
  }, [container?.id, isDemoMode]);

  const handleUpdateLimits = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!container) return;
    setUpdatingLimits(true);
    setLimitsNotice(null);

    if (isDemoMode) {
      setTimeout(() => {
        setLimitsNotice('Simulated update: Limits adjusted successfully in Demo mode.');
        setUpdatingLimits(false);
        setLimitsModalOpen(false);
      }, 500);
      return;
    }

    try {
      const payload: any = {};
      if (editMemMb.trim()) {
        payload.mem_limit = `${editMemMb.trim()}m`;
      }
      if (editCpuShares.trim()) {
        payload.cpu_shares = parseInt(editCpuShares.trim(), 10);
      }
      if (editCpus.trim()) {
        payload.cpus = parseFloat(editCpus.trim());
      }

      const res = await api.containers.updateLimits(container.id, payload);
      setLimitsNotice(res.message || 'Container limits updated successfully.');
      fetchLimits();
      setTimeout(() => {
        setLimitsModalOpen(false);
        setLimitsNotice(null);
      }, 2000);
    } catch (err: any) {
      setLimitsNotice(`Update constraint notice: ${err?.message || err}`);
    } finally {
      setUpdatingLimits(false);
    }
  };

  // Telemetry metric values (preferring real-time WebSocket stream)
  const cpuPercent = currentLive
    ? currentLive.cpu_usage_percent
    : liveStats
    ? liveStats.cpu.percent
    : container
    ? container.cpu_percent
    : 0;

  const memUsage = currentLive
    ? currentLive.memory_usage_bytes
    : liveStats
    ? liveStats.memory.usage
    : container
    ? container.memory_usage
    : 0;

  const memLimit = currentLive
    ? currentLive.memory_limit_bytes
    : liveStats
    ? liveStats.memory.limit
    : container
    ? container.memory_limit
    : 0;

  const memPercent = currentLive
    ? currentLive.memory_usage_percent
    : liveStats
    ? liveStats.memory.percent
    : container
    ? container.memory_percent
    : 0;

  const rxRate = currentLive ? currentLive.network_rx_bytes_per_sec : 0;
  const txRate = currentLive ? currentLive.network_tx_bytes_per_sec : 0;
  const rxBytes = currentLive
    ? currentLive.network_rx_bytes
    : liveStats
    ? liveStats.network.rx_bytes
    : container
    ? container.network_rx
    : 0;
  const txBytes = currentLive
    ? currentLive.network_tx_bytes
    : liveStats
    ? liveStats.network.tx_bytes
    : container
    ? container.network_tx
    : 0;

  const diskRead = currentLive ? currentLive.disk_read_bytes || 0 : liveStats ? liveStats.disk_io.read_bytes : 0;
  const diskWrite = currentLive ? currentLive.disk_write_bytes || 0 : liveStats ? liveStats.disk_io.write_bytes : 0;

  const defaultCpuData = useMemo(
    () =>
      container
        ? generateContainerMetricSeries(container.name, cpuPercent, memPercent, 24)
        : [],
    [container, cpuPercent, memPercent]
  );
  const defaultNetData = useMemo(() => generateNetworkSeries(24), []);

  const chartData = useMemo(() => {
    if (!isDemoMode && containerHistory.length > 1) {
      return containerHistory;
    }
    return defaultCpuData;
  }, [isDemoMode, containerHistory, defaultCpuData]);

  const netChartData = useMemo(() => {
    if (!isDemoMode && containerHistory.length > 1) {
      return containerHistory;
    }
    return defaultNetData;
  }, [isDemoMode, containerHistory, defaultNetData]);

  const handleAction = async (action: 'start' | 'stop' | 'restart') => {
    if (!container) return;
    setActionLoading(true);
    try {
      let res;
      if (action === 'start') res = await startContainer(container.id);
      else if (action === 'stop') res = await stopContainer(container.id);
      else if (action === 'restart') res = await restartContainer(container.id);
      setFeedback(res?.message || `Sent ${action.toUpperCase()} command successfully`);
    } catch (err: any) {
      setFeedback(`Failed to ${action}: ${err?.message || err}`);
    } finally {
      setActionLoading(false);
      setTimeout(() => setFeedback(null), 4000);
    }
  };

  if (!container) {
    return (
      <div className="py-12">
        <EmptyState
          icon={Boxes}
          title="Container Not Found"
          description={`Unable to locate container with identifier: "${id}"`}
          action={
            <button
              onClick={() => navigate('/containers')}
              className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm transition-colors"
            >
              Back to Containers
            </button>
          }
        />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {isDemoMode ? <DemoModeBanner /> : <LiveModeBanner />}

      {feedback && (
        <div className="bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs px-4 py-2.5 rounded-lg flex items-center justify-between">
          <span>{feedback}</span>
          <button onClick={() => setFeedback(null)} className="text-blue-400 hover:text-white font-bold ml-4">
            ×
          </button>
        </div>
      )}

      {/* Header with Navigation and Lifecycle Actions */}
      <div className="space-y-3">
        <button
          onClick={() => navigate('/containers')}
          className="inline-flex items-center gap-2 text-xs font-medium text-slate-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Containers</span>
        </button>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 shadow-inner">
              <Boxes className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h1 className="text-xl font-bold text-white tracking-tight font-mono">
                  {container.name}
                </h1>
                <StatusBadge status={container.status} />
                {!isDemoMode && container.status === 'running' && wsStatus === 'CONNECTED' && (
                  <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-mono text-cyan-400 bg-cyan-500/10 border border-cyan-500/25">
                    <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                    Live Monitored
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-slate-400 font-mono mt-1">
                <span>ID: {container.id}</span>
                <span>•</span>
                <span>Image: {container.image}</span>
                {currentLive && (
                  <>
                    <span>•</span>
                    <span className="text-emerald-400">
                      Sampled: {new Date(currentLive.timestamp).toLocaleTimeString()}
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            {container.status === 'running' ? (
              <>
                <button
                  disabled={actionLoading}
                  onClick={() => handleAction('restart')}
                  className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-all border border-slate-700/60 disabled:opacity-40"
                >
                  <RotateCcw className="w-3.5 h-3.5 text-amber-400" />
                  <span>Restart</span>
                </button>
                <button
                  disabled={actionLoading}
                  onClick={() => handleAction('stop')}
                  className="flex items-center gap-2 px-3.5 py-2 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 rounded-lg text-xs font-semibold transition-all border border-rose-500/25 disabled:opacity-40"
                >
                  <Square className="w-3.5 h-3.5" />
                  <span>Stop</span>
                </button>
              </>
            ) : (
              <button
                disabled={actionLoading}
                onClick={() => handleAction('start')}
                className="flex items-center gap-2 px-3.5 py-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-semibold transition-all border border-emerald-500/25 disabled:opacity-40"
              >
                <Play className="w-3.5 h-3.5" />
                <span>Start</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Primary Key Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Compute Load"
          value={formatPercent(cpuPercent)}
          icon={Cpu}
          iconColor="text-blue-400"
          iconBg="bg-blue-500/10 border-blue-500/25"
          subtitle={
            currentLive
              ? `${currentLive.cpu_count} vCPU Core(s)`
              : liveStats
              ? `${liveStats.cpu.online_cpus} core(s)`
              : 'Real-time core share'
          }
        />
        <MetricCard
          title="Memory Consumption"
          value={formatBytes(memUsage)}
          icon={MemoryStick}
          iconColor="text-purple-400"
          iconBg="bg-purple-500/10 border-purple-500/25"
          subtitle={`${formatPercent(memPercent)} of ${formatBytes(memLimit)} cap`}
        />
        <MetricCard
          title="Network Transfer Rate"
          value={!isDemoMode ? `${formatBytes(rxRate)}/s` : formatBytes(rxBytes)}
          icon={Network}
          iconColor="text-cyan-400"
          iconBg="bg-cyan-500/10 border-cyan-500/25"
          subtitle={
            !isDemoMode
              ? `TX: ${formatBytes(txRate)}/s (${currentLive ? currentLive.network_rx_mbps.toFixed(3) : 0} Mbps)`
              : `Total Out: ${formatBytes(txBytes)}`
          }
        />
        <MetricCard
          title="Block I/O"
          value={formatBytes(diskRead + diskWrite)}
          icon={HardDrive}
          iconColor="text-emerald-400"
          iconBg="bg-emerald-500/10 border-emerald-500/25"
          subtitle={`R: ${formatBytes(diskRead)} • W: ${formatBytes(diskWrite)}`}
        />
      </div>

      {/* Tabs */}
      <div className="flex border-b border-slate-800/80 gap-6 text-sm font-medium overflow-x-auto">
        <button
          onClick={() => setActiveTab('metrics')}
          className={`pb-3 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'metrics'
              ? 'border-blue-400 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Cpu className="w-4 h-4" /> Telemetry Charts
        </button>
        <button
          onClick={() => setActiveTab('limits')}
          className={`pb-3 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'limits'
              ? 'border-blue-400 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Sliders className="w-4 h-4" /> Resource Limits & Cgroups
        </button>
        <button
          onClick={() => setActiveTab('insights')}
          className={`pb-3 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'insights'
              ? 'border-blue-400 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Lightbulb className="w-4 h-4" /> Smart Insights
          {containerInsights.length > 0 && (
            <span className="px-1.5 py-0.2 bg-blue-500/20 text-blue-400 rounded-full text-[10px] font-mono">
              {containerInsights.length}
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('config')}
          className={`pb-3 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'config'
              ? 'border-blue-400 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-4 h-4" /> Specs & Configuration
        </button>
        <button
          onClick={() => setActiveTab('logs')}
          className={`pb-3 border-b-2 transition-all flex items-center gap-2 whitespace-nowrap ${
            activeTab === 'logs'
              ? 'border-blue-400 text-blue-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Terminal className="w-4 h-4" /> Stream Logs Preview
        </button>
      </div>

      {/* Tab 1: Charts */}
      {activeTab === 'metrics' && (
        <div className="space-y-6">
          {/* Historical vs Real-Time View Toggle Bar */}
          {!isDemoMode && (
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between bg-[#111827]/90 border border-slate-800/80 rounded-xl p-3 shadow-lg shadow-black/20">
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setChartViewMode('historical')}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    chartViewMode === 'historical'
                      ? 'bg-blue-600/20 text-blue-300 border border-blue-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  )}
                >
                  <Database className="w-3.5 h-3.5 text-blue-400" />
                  <span>Historical Database Telemetry</span>
                </button>
                <button
                  onClick={() => setChartViewMode('realtime')}
                  className={clsx(
                    'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    chartViewMode === 'realtime'
                      ? 'bg-cyan-600/20 text-cyan-300 border border-cyan-500/40 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  )}
                >
                  <Activity className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
                  <span>Live Stream (60s)</span>
                </button>
              </div>

              {chartViewMode === 'historical' && (
                <div className="flex items-center gap-1 bg-slate-900/90 border border-slate-800 rounded-lg p-1">
                  <Calendar className="w-3 h-3 text-slate-500 ml-1.5 mr-1" />
                  {(['15m', '1h', '6h', '24h', '7d'] as TimeRange[]).map((r) => (
                    <button
                      key={r}
                      onClick={() => setHistTimeRange(r)}
                      className={clsx(
                        'px-2 py-0.5 rounded text-[11px] font-mono transition-all',
                        histTimeRange === r
                          ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                          : 'text-slate-400 hover:text-slate-200'
                      )}
                    >
                      {r.toUpperCase()}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Historical Summary Metric Strip (when historical mode active) */}
          {!isDemoMode && chartViewMode === 'historical' && dbSummary && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-[#111827]/80 border border-slate-800/80 rounded-xl p-3.5">
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Avg CPU Load</span>
                <div className="text-lg font-bold font-mono text-blue-400 mt-0.5">{dbSummary.cpu.avg}%</div>
                <div className="text-[10px] text-slate-400">Peak: {dbSummary.cpu.max}% | Min: {dbSummary.cpu.min}%</div>
              </div>
              <div className="bg-[#111827]/80 border border-slate-800/80 rounded-xl p-3.5">
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Peak Memory Used</span>
                <div className="text-lg font-bold font-mono text-purple-400 mt-0.5">{formatBytes(dbSummary.memory.peak_bytes)}</div>
                <div className="text-[10px] text-slate-400">Avg Utilization: {dbSummary.memory.avg_percent}%</div>
              </div>
              <div className="bg-[#111827]/80 border border-slate-800/80 rounded-xl p-3.5">
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Total Network RX/TX</span>
                <div className="text-lg font-bold font-mono text-cyan-400 mt-0.5">
                  {formatBytes(dbSummary.network.total_rx_bytes + dbSummary.network.total_tx_bytes)}
                </div>
                <div className="text-[10px] text-slate-400">Peak Speed: {formatBytes(dbSummary.network.peak_rx_speed)}/s</div>
              </div>
              <div className="bg-[#111827]/80 border border-slate-800/80 rounded-xl p-3.5">
                <span className="text-[10px] font-medium text-slate-400 uppercase tracking-wider">Total Disk I/O</span>
                <div className="text-lg font-bold font-mono text-amber-400 mt-0.5">
                  {formatBytes(dbSummary.disk.total_read_bytes + dbSummary.disk.total_write_bytes)}
                </div>
                <div className="text-[10px] text-slate-400">R: {formatBytes(dbSummary.disk.total_read_bytes)} • W: {formatBytes(dbSummary.disk.total_write_bytes)}</div>
              </div>
            </div>
          )}

          {/* Charts Rendering */}
          {!isDemoMode && chartViewMode === 'historical' ? (
            histLoading ? (
              <div className="h-64 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
                <span>Loading container telemetry from database...</span>
              </div>
            ) : dbHistory.length === 0 ? (
              <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-8">
                <EmptyState
                  title="No historical telemetry recorded for this container"
                  description={`No samples recorded in the database over the last ${histTimeRange.toUpperCase()}. Historical records are saved every 5 seconds while container is running.`}
                  icon={Database}
                />
              </div>
            ) : (
              <div className="space-y-6">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Historical CPU */}
                  <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-white">Historical CPU Utilization</h3>
                      <span className="text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full font-mono">
                        {histTimeRange.toUpperCase()} Horizon
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-4">Average and peak core share percentage</p>
                    <LineChart
                      data={dbHistory.map((d) => ({ ...d, time: d.time }))}
                      lines={[
                        { key: 'cpu_avg', color: '#3b82f6', label: 'Average CPU %' },
                        { key: 'cpu_max', color: '#f59e0b', label: 'Peak CPU %' },
                      ]}
                      height={200}
                    />
                  </div>

                  {/* Historical Memory */}
                  <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-white">Historical Memory Allocation</h3>
                      <span className="text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full font-mono">
                        {histTimeRange.toUpperCase()} Horizon
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-4">RAM footprint in Megabytes</p>
                    <AreaChart
                      data={dbHistory.map((d) => ({ ...d, time: d.time }))}
                      dataKey="memory"
                      color="#8b5cf6"
                      height={200}
                      label="Allocated (MB)"
                    />
                  </div>
                </div>

                {/* Historical Network & Disk */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-white">Historical Network Speed</h3>
                      <span className="text-[10px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full font-mono">
                        KB/s Throughput
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-4">Inbound (RX) and outbound (TX) transfer speeds</p>
                    <LineChart
                      data={dbHistory.map((d) => ({ ...d, time: d.time }))}
                      lines={[
                        { key: 'network_rx_kb', color: '#06b6d4', label: 'RX Rate (KB/s)' },
                        { key: 'network_tx_kb', color: '#a855f7', label: 'TX Rate (KB/s)' },
                      ]}
                      height={180}
                      formatYAxis={(v) => `${v}KB`}
                    />
                  </div>

                  <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-sm font-bold text-white">Historical Disk I/O Activity</h3>
                      <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-mono">
                        KB/s Activity
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mb-4">Read and write operational transfer speeds</p>
                    <LineChart
                      data={dbHistory.map((d) => ({ ...d, time: d.time }))}
                      lines={[
                        { key: 'disk_read_kb', color: '#10b981', label: 'Read (KB/s)' },
                        { key: 'disk_write_kb', color: '#f59e0b', label: 'Write (KB/s)' },
                      ]}
                      height={180}
                      formatYAxis={(v) => `${v}KB`}
                    />
                  </div>
                </div>
              </div>
            )
          ) : (
            /* Live Stream / Demo Charts */
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-white">CPU Load</h3>
                    <span className="text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full font-mono">
                      {!isDemoMode ? 'Real-Time Telemetry' : 'Demo Window'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">Sampled live stream</p>
                  <AreaChart data={chartData} dataKey="cpu" color="#3b82f6" height={200} label="CPU %" />
                </div>
                <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold text-white">Memory Allocation</h3>
                    <span className="text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full font-mono">
                      {!isDemoMode ? 'Real-Time Telemetry' : 'Demo Window'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mb-4">Sampled live stream</p>
                  <AreaChart data={chartData} dataKey="memory" color="#8b5cf6" height={200} label="Memory %" />
                </div>
              </div>

              <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-bold text-white">Network Activity (Throughput)</h3>
                  <span className="text-[10px] text-cyan-400 bg-cyan-500/10 border border-cyan-500/20 px-2 py-0.5 rounded-full font-mono">
                    {!isDemoMode ? 'KB/sec Transfer Speed' : 'Simulated Traffic'}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mb-4">Incoming (RX) and outgoing (TX) rate</p>
                <LineChart
                  data={netChartData}
                  lines={[
                    { key: 'network_rx', color: '#06b6d4', label: 'RX Throughput (KB/s)' },
                    { key: 'network_tx', color: '#a855f7', label: 'TX Throughput (KB/s)' },
                  ]}
                  height={180}
                  formatYAxis={(v) => `${v} KB/s`}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab: Resource Limits & Cgroups */}
      {activeTab === 'limits' && (
        <div className="space-y-6">
          <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20 space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-800/80 gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-blue-400" />
                  <span>Docker Cgroup Resource Allocations & Limits</span>
                </h3>
                <p className="text-xs text-slate-400">
                  Hardware boundary constraints enforced by host kernel cgroups
                </p>
              </div>

              <button
                onClick={() => setLimitsModalOpen(true)}
                className="flex items-center gap-2 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors self-start sm:self-auto"
              >
                <SlidersHorizontal className="w-3.5 h-3.5" />
                <span>Tune Limits</span>
              </button>
            </div>

            {limitsLoading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400 text-xs">
                <RefreshCw className="w-5 h-5 animate-spin text-blue-400" />
                <span>Inspecting container HostConfig limits...</span>
              </div>
            ) : containerLimits ? (
              <div className="space-y-6">
                {/* Visual Limit vs Usage Progress */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-semibold">Memory Ceiling</span>
                      <span className="font-mono text-white font-bold">
                        {containerLimits.memory_limit_mb > 0 && containerLimits.memory_limit_mb < 500000
                          ? `${containerLimits.memory_limit_mb.toFixed(0)} MB`
                          : 'Unlimited (Host RAM)'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 flex justify-between font-mono">
                      <span>Live Consumption:</span>
                      <span className="text-purple-400">
                        {containerLimits.live_memory_usage_mb?.toFixed(1) || '0'} MB (
                        {containerLimits.live_memory_percent?.toFixed(1) || '0'}%)
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-purple-500 h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, containerLimits.live_memory_percent || 0)}%`,
                        }}
                      />
                    </div>
                  </div>

                  <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400 font-semibold">CPU Quota & Effective Cores</span>
                      <span className="font-mono text-white font-bold">
                        {containerLimits.effective_cpus > 0
                          ? `${containerLimits.effective_cpus.toFixed(2)} vCPU Core(s)`
                          : 'Unlimited (All Cores)'}
                      </span>
                    </div>
                    <div className="text-xs text-slate-300 flex justify-between font-mono">
                      <span>Live CPU Load:</span>
                      <span className="text-blue-400">
                        {containerLimits.live_cpu_percent?.toFixed(1) || '0'}%
                      </span>
                    </div>
                    <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                      <div
                        className="bg-blue-500 h-full rounded-full transition-all"
                        style={{
                          width: `${Math.min(100, containerLimits.live_cpu_percent || 0)}%`,
                        }}
                      />
                    </div>
                  </div>
                </div>

                {/* Detailed Table */}
                <div className="overflow-x-auto">
                  <table className="w-full text-xs font-mono">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/30">
                        <th className="py-2.5 px-3 text-left">Parameter</th>
                        <th className="py-2.5 px-3 text-left">Configured Value</th>
                        <th className="py-2.5 px-3 text-left">Live Status</th>
                        <th className="py-2.5 px-3 text-left">Engine Note</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 text-slate-300">
                      <tr>
                        <td className="py-2.5 px-3 text-white font-semibold">Memory Hard Limit (mem_limit)</td>
                        <td className="py-2.5 px-3 text-purple-400">
                          {containerLimits.memory_limit_mb > 0 && containerLimits.memory_limit_mb < 500000
                            ? `${containerLimits.memory_limit_mb.toFixed(0)} MB`
                            : '0 (Unlimited)'}
                        </td>
                        <td className="py-2.5 px-3">
                          {containerLimits.live_memory_usage_mb?.toFixed(1)} MB in use
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                          Container is OOM-killed if memory exceeds this cap
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 text-white font-semibold">Memory Reservation (soft)</td>
                        <td className="py-2.5 px-3 text-purple-400">
                          {containerLimits.memory_reservation_mb > 0
                            ? `${containerLimits.memory_reservation_mb.toFixed(0)} MB`
                            : 'None'}
                        </td>
                        <td className="py-2.5 px-3">
                          {containerLimits.memory_reservation_mb > 0 ? 'Active' : 'Unbounded'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                          Guaranteed baseline before host memory reclamation
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 text-white font-semibold">CPU Shares (Relative Weight)</td>
                        <td className="py-2.5 px-3 text-blue-400">
                          {containerLimits.cpu_shares || 1024} (default 1024)
                        </td>
                        <td className="py-2.5 px-3">
                          {((containerLimits.cpu_shares || 1024) / 1024).toFixed(2)}x standard share
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                          Relative priority when CPU contention occurs
                        </td>
                      </tr>
                      <tr>
                        <td className="py-2.5 px-3 text-white font-semibold">CPU CFS Quota / Period</td>
                        <td className="py-2.5 px-3 text-blue-400">
                          {containerLimits.cpu_quota > 0
                            ? `${containerLimits.cpu_quota} / ${containerLimits.cpu_period || 100000}`
                            : '0 (Unconstrained)'}
                        </td>
                        <td className="py-2.5 px-3">
                          {containerLimits.effective_cpus > 0
                            ? `${containerLimits.effective_cpus.toFixed(2)} cores`
                            : 'All cores'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-400 text-[11px]">
                          Completely caps max CPU time per scheduling period
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="py-6 text-center text-slate-500 text-xs">
                Unable to inspect container resource limits.
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab: Smart Insights */}
      {activeTab === 'insights' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Lightbulb className="w-4 h-4 text-amber-400" />
                <span>Intelligent Diagnostic Insights & Recommendations</span>
              </h3>
              <p className="text-xs text-slate-400">
                Automated rule-based heuristic analysis detecting performance saturation and optimization opportunities
              </p>
            </div>
          </div>

          {containerInsights.length === 0 ? (
            <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-8">
              <EmptyState
                icon={CheckCircle}
                title="Container Is Operating Nominally"
                description="No performance bottlenecks, memory leak patterns, or restart flapping detected for this container."
              />
            </div>
          ) : (
            <div className="space-y-3">
              {containerInsights.map((insight) => (
                <div
                  key={insight.id}
                  className={clsx(
                    'bg-[#111827]/90 border rounded-xl p-4 shadow-lg shadow-black/20 space-y-2',
                    insight.severity === 'critical'
                      ? 'border-red-500/40 bg-red-950/10'
                      : insight.severity === 'warning'
                      ? 'border-amber-500/40 bg-amber-950/10'
                      : 'border-blue-500/40 bg-blue-950/10'
                  )}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={clsx(
                          'text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded',
                          insight.severity === 'critical'
                            ? 'bg-red-500/20 text-red-400 border border-red-500/30'
                            : insight.severity === 'warning'
                            ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                            : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                        )}
                      >
                        {insight.severity}
                      </span>
                      <span className="text-[10px] font-mono text-slate-400 uppercase bg-slate-800/80 px-2 py-0.5 rounded">
                        {insight.category}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-500">
                      {new Date(insight.detected_at).toLocaleTimeString()}
                    </span>
                  </div>

                  <h4 className="text-sm font-semibold text-white">{insight.title}</h4>
                  <p className="text-xs text-slate-300">{insight.description}</p>

                  <div className="bg-slate-900/80 rounded-lg p-2.5 border border-slate-800 text-xs text-slate-200 mt-2">
                    <span className="text-blue-400 font-semibold">Recommendation: </span>
                    <span>{insight.recommendation}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Edit Limits Modal */}
      {limitsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#111827] border border-blue-500/40 rounded-xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                  <SlidersHorizontal className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-white font-semibold text-sm">Tune Cgroup Resource Limits</h3>
                  <p className="text-slate-400 text-xs font-mono">{container.name}</p>
                </div>
              </div>
              <button
                onClick={() => setLimitsModalOpen(false)}
                className="text-slate-400 hover:text-white text-base px-2 py-1"
              >
                ✕
              </button>
            </div>

            {limitsNotice && (
              <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-xs text-blue-300">
                {limitsNotice}
              </div>
            )}

            <form onSubmit={handleUpdateLimits} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="text-slate-300 font-semibold block">Memory Limit (MB)</label>
                <input
                  type="number"
                  value={editMemMb}
                  onChange={(e) => setEditMemMb(e.target.value)}
                  placeholder="e.g. 512, 1024 (leave blank for unlimited)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 outline-none"
                />
                <span className="text-[10px] text-slate-500 block">
                  Hard memory limit in Megabytes.
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold block">CPU Shares (Weight)</label>
                <input
                  type="number"
                  value={editCpuShares}
                  onChange={(e) => setEditCpuShares(e.target.value)}
                  placeholder="e.g. 1024 (standard), 512, 2048"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 outline-none"
                />
                <span className="text-[10px] text-slate-500 block">
                  Relative weight among competing containers (default 1024).
                </span>
              </div>

              <div className="space-y-1">
                <label className="text-slate-300 font-semibold block">Effective CPUs (Cores)</label>
                <input
                  type="number"
                  step="0.1"
                  value={editCpus}
                  onChange={(e) => setEditCpus(e.target.value)}
                  placeholder="e.g. 1.0, 2.5 (leave blank for unconstrained)"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-white font-mono focus:border-blue-500 outline-none"
                />
                <span className="text-[10px] text-slate-500 block">
                  Number of CPUs available to the container.
                </span>
              </div>

              <div className="flex justify-end gap-2 pt-2 border-t border-slate-800">
                <button
                  type="button"
                  disabled={updatingLimits}
                  onClick={() => setLimitsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={updatingLimits}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5"
                >
                  {updatingLimits ? (
                    <span>Applying...</span>
                  ) : (
                    <>
                      <Save className="w-3.5 h-3.5" />
                      <span>Save Changes</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Tab 2: Config */}
      {activeTab === 'config' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20 space-y-4">
            <h3 className="text-sm font-bold text-white border-b border-slate-800/80 pb-3">
              Container Specifications
            </h3>
            <dl className="space-y-3.5 text-xs">
              {[
                { label: 'Full Image Tag', val: container.image, icon: Layers },
                { label: 'Short ID', val: container.id, icon: Hash, mono: true },
                { label: 'Network Mode', val: 'bridge (default)', icon: Network },
                {
                  label: 'Exposed Ports',
                  val: container.ports.length > 0 ? container.ports.join(', ') : 'None bound',
                  mono: true,
                },
                { label: 'Memory Ceiling', val: formatBytes(container.memory_limit), mono: true },
                { label: 'Uptime', val: container.uptime || 'Unknown' },
                { label: 'Created At', val: container.created || 'N/A' },
              ].map((item) => (
                <div key={item.label} className="flex justify-between items-center py-1">
                  <span className="text-slate-400">{item.label}</span>
                  <span className={`text-slate-100 font-semibold ${item.mono ? 'font-mono' : ''}`}>
                    {item.val}
                  </span>
                </div>
              ))}
            </dl>
          </div>

          <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20 space-y-4">
            <h3 className="text-sm font-bold text-white border-b border-slate-800/80 pb-3">
              Container Labels & Metadata
            </h3>
            {Object.keys(container.labels || {}).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(container.labels).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center justify-between text-xs p-2.5 rounded-lg bg-slate-900/60 border border-slate-800"
                  >
                    <span className="text-slate-400 font-mono truncate max-w-[200px]">{k}</span>
                    <span className="text-blue-400 font-mono font-semibold truncate max-w-[200px]">{v}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-500 py-4">No custom labels applied.</p>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Logs Preview */}
      {activeTab === 'logs' && (
        <div className="bg-[#060a14] border border-slate-800/80 rounded-xl overflow-hidden shadow-2xl font-mono text-xs">
          <div className="px-4 py-3 bg-[#0d1225] border-b border-slate-800/80 flex items-center justify-between">
            <span className="text-slate-400">stdout/stderr snapshot — {container.name}</span>
            <button
              onClick={() => navigate(`/logs?container=${container.id}`)}
              className="text-blue-400 hover:text-blue-300 text-xs font-semibold"
            >
              Open Full Interactive Log Viewer →
            </button>
          </div>
          <div className="p-4 space-y-1 text-slate-300 h-64 overflow-y-auto">
            {logsLoading ? (
              <div className="flex items-center gap-2 text-slate-500 py-6 justify-center">
                <RefreshCw className="w-4 h-4 animate-spin" />
                <span>Loading container logs...</span>
              </div>
            ) : isDemoMode ? (
              <>
                <div className="text-emerald-400">
                  [2026-11-16 17:50:02] [INFO] Container initialized. Starting service daemon...
                </div>
                <div className="text-slate-400">
                  [2026-11-16 17:50:03] [INFO] Listening for connections on 0.0.0.0:{container.ports[0] || '80'}
                </div>
                <div className="text-slate-400">
                  [2026-11-16 17:51:10] [INFO] Health probe returned status: OK (lat: 2ms)
                </div>
                <div className="text-amber-400">
                  [2026-11-16 17:52:45] [WARN] Process pool garbage collection invoked
                </div>
                <div className="text-slate-400">
                  [2026-11-16 17:53:00] [INFO] Heartbeat sent to orchestrator
                </div>
                <div className="text-blue-400">
                  [2026-11-16 17:54:30] [INFO] -- [DEMO MODE: Switch to Live Mode to view real Docker stdout] --
                </div>
              </>
            ) : liveLogs.length === 0 ? (
              <div className="text-slate-500 italic py-6 text-center">
                No logs recorded yet for this container.
              </div>
            ) : (
              liveLogs.map((line, idx) => (
                <div
                  key={idx}
                  className={
                    line.includes('ERROR') || line.includes('Error')
                      ? 'text-rose-400'
                      : line.includes('WARN')
                      ? 'text-amber-400'
                      : 'text-slate-300'
                  }
                >
                  {line}
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
