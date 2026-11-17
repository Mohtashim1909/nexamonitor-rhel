import React, { useState, useMemo, useEffect } from 'react';
import {
  GitCompare,
  Cpu,
  MemoryStick,
  Network,
  HardDrive,
  Calendar,
  RefreshCw,
  Crown,
  Check,
  AlertCircle,
  Activity,
  Zap,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DemoModeBanner } from '@/components/shared/DemoModeBanner';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { LineChart } from '@/components/charts/LineChart';
import { EmptyState } from '@/components/shared/EmptyState';
import { useApp } from '@/context/AppContext';
import { formatBytes, formatPercent } from '@/utils/format';
import { generateContainerMetricSeries } from '@/data/demo';
import { api } from '@/services/api';
import { clsx } from 'clsx';
import type { TimeRange, ContainerComparisonResponse, ContainerComparisonMetric } from '@/types';

const TIME_RANGES: { label: string; value: TimeRange }[] = [
  { label: 'Real-time', value: '15m' },
  { label: '1H', value: '1h' },
  { label: '6H', value: '6h' },
  { label: '24H', value: '24h' },
  { label: '7D', value: '7d' },
];

const CONTAINER_COLORS = [
  '#3b82f6', // blue
  '#a855f7', // purple
  '#10b981', // emerald
  '#f59e0b', // amber
  '#ef4444', // rose
  '#06b6d4', // cyan
  '#ec4899', // pink
  '#8b5cf6', // violet
];

export function ComparisonsPage() {
  const { containers, isDemoMode, liveMetrics } = useApp();

  // Multi-container selection: default to first 2 or 3 containers
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    return containers.slice(0, Math.min(3, containers.length)).map((c) => c.id);
  });

  const [timeRange, setTimeRange] = useState<TimeRange>('24h');
  const [dbComparison, setDbComparison] = useState<ContainerComparisonResponse | null>(null);
  const [loading, setLoading] = useState(false);

  // Sync default selection if initial containers were empty and then loaded
  useEffect(() => {
    if (selectedIds.length === 0 && containers.length > 0) {
      setSelectedIds(containers.slice(0, Math.min(3, containers.length)).map((c) => c.id));
    }
  }, [containers, selectedIds.length]);

  const toggleContainer = (id: string) => {
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        if (prev.length <= 1) return prev; // Keep at least one selected
        return prev.filter((item) => item !== id);
      } else {
        if (prev.length >= 6) return prev; // Limit to 6 for readable chart overlays
        return [...prev, id];
      }
    });
  };

  const selectAll = () => {
    setSelectedIds(containers.slice(0, 6).map((c) => c.id));
  };

  const selectedContainers = useMemo(() => {
    return containers.filter((c) => selectedIds.includes(c.id));
  }, [containers, selectedIds]);

  // Color mapping per container ID
  const colorMap = useMemo(() => {
    const map: Record<string, string> = {};
    selectedContainers.forEach((c, idx) => {
      map[c.id] = CONTAINER_COLORS[idx % CONTAINER_COLORS.length];
    });
    return map;
  }, [selectedContainers]);

  // Fetch real historical comparison from SQLite in LIVE mode
  useEffect(() => {
    if (isDemoMode || selectedIds.length < 2) return;

    let mounted = true;
    setLoading(true);

    api.analytics
      .comparison({
        container_ids: selectedIds,
        time_range: timeRange,
      })
      .then((res) => {
        if (mounted) {
          setDbComparison(res);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (mounted) {
          console.debug('Failed to fetch multi-container comparison:', err);
          setLoading(false);
        }
      });

    return () => {
      mounted = false;
    };
  }, [isDemoMode, selectedIds, timeRange]);

  // Combined Chart Series
  const chartData = useMemo(() => {
    if (!isDemoMode && dbComparison && dbComparison.series.length > 0) {
      return dbComparison.series.map((pt) => {
        const item: any = { time: pt.time };
        selectedContainers.forEach((c) => {
          const alias = c.name || c.id;
          item[`cpu_${c.id}`] = pt[`cpu_${alias}`] ?? pt[`cpu_${c.id}`] ?? 0;
          item[`mem_${c.id}`] = pt[`mem_${alias}`] ?? pt[`mem_${c.id}`] ?? 0;
          item[`rx_${c.id}`] = pt[`rx_${alias}`] ?? pt[`rx_${c.id}`] ?? 0;
          item[`tx_${c.id}`] = pt[`tx_${alias}`] ?? pt[`tx_${c.id}`] ?? 0;
          item[`disk_${c.id}`] = pt[`disk_${alias}`] ?? pt[`disk_${c.id}`] ?? 0;
        });
        return item;
      });
    }

    // Demo mode fallback: generate synthetic series for selected containers
    if (selectedContainers.length === 0) return [];
    const baseSeries = generateContainerMetricSeries(
      selectedContainers[0].name,
      selectedContainers[0].cpu_percent,
      selectedContainers[0].memory_percent,
      20
    );

    return baseSeries.map((basePt, i) => {
      const item: any = { time: basePt.time };
      selectedContainers.forEach((c, cIdx) => {
        const factor = 1 + cIdx * 0.15;
        item[`cpu_${c.id}`] = Math.max(0, Math.min(100, (basePt.cpu || 5) * factor));
        item[`mem_${c.id}`] = (basePt.memory || 100) * factor;
        item[`rx_${c.id}`] = ((basePt.rx || 10) * factor);
        item[`disk_${c.id}`] = ((cIdx + 1) * 12.5);
      });
      return item;
    });
  }, [isDemoMode, dbComparison, selectedContainers]);

  // Aggregate stats lookup map
  const statsMap = useMemo(() => {
    const map: Record<string, ContainerComparisonMetric> = {};
    if (dbComparison?.containers) {
      dbComparison.containers.forEach((m) => {
        map[m.container_id] = m;
      });
    }
    return map;
  }, [dbComparison]);

  return (
    <div className="space-y-6">
      {isDemoMode && <DemoModeBanner />}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <PageHeader
          title="Multi-Container Comparisons"
          subtitle="Cross-container resource benchmarking, peak consumer detection, and historical overlay analysis"
          badge="Multi-Instance Benchmark"
        />

        {/* Time-Range Selector */}
        {!isDemoMode && (
          <div className="flex items-center gap-1 bg-[#111827] border border-slate-800/80 rounded-xl p-1.5 self-start sm:self-auto shadow-sm">
            <Calendar className="w-3.5 h-3.5 text-slate-500 ml-2 mr-1" />
            {TIME_RANGES.map((r) => (
              <button
                key={r.value}
                onClick={() => setTimeRange(r.value)}
                className={clsx(
                  'px-2.5 py-1 rounded-md text-xs font-mono font-medium transition-all',
                  timeRange === r.value
                    ? 'bg-blue-500/20 text-blue-400 border border-blue-500/30 shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Multi-Container Selection Bar */}
      <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-4 shadow-lg shadow-black/20 space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-blue-400" />
            <span className="text-xs font-semibold text-slate-200 uppercase tracking-wider">
              Select Containers to Compare ({selectedIds.length} of {containers.length} active, max 6)
            </span>
          </div>
          <div className="flex items-center gap-2 text-xs">
            <button
              onClick={selectAll}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium px-2 py-1 rounded bg-blue-500/10 border border-blue-500/20 transition-colors"
            >
              Select Top {Math.min(6, containers.length)}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 pt-1">
          {containers.map((c, idx) => {
            const isSelected = selectedIds.includes(c.id);
            const color = colorMap[c.id] || CONTAINER_COLORS[idx % CONTAINER_COLORS.length];
            return (
              <button
                key={c.id}
                onClick={() => toggleContainer(c.id)}
                className={clsx(
                  'flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-mono transition-all border',
                  isSelected
                    ? 'bg-slate-800/90 text-white border-blue-500/50 shadow-md'
                    : 'bg-slate-900/50 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-300'
                )}
              >
                <div
                  className="w-2.5 h-2.5 rounded-full transition-transform"
                  style={{
                    backgroundColor: isSelected ? color : '#475569',
                    boxShadow: isSelected ? `0 0 8px ${color}80` : 'none',
                  }}
                />
                <span className="font-medium">{c.name}</span>
                {isSelected && <Check className="w-3.5 h-3.5 text-blue-400 ml-1" />}
              </button>
            );
          })}
        </div>
      </div>

      {selectedContainers.length < 2 ? (
        <EmptyState
          icon={GitCompare}
          title="Select At Least 2 Containers"
          description="Choose two or more containers above to unlock comparative overlay charts and resource consumption rankings."
        />
      ) : (
        <>
          {/* Selected Container Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {selectedContainers.map((c) => {
              const stats = statsMap[c.id];
              const color = colorMap[c.id];
              const live = liveMetrics[c.id];
              const cpuUsage = live ? live.cpu_usage_percent : c.cpu_percent;
              const memUsage = live ? live.memory_usage_bytes : c.memory_usage;
              const memPct = live ? live.memory_usage_percent : c.memory_percent;

              return (
                <div
                  key={c.id}
                  className="bg-[#111827]/90 border rounded-xl p-4 shadow-lg shadow-black/20 space-y-3 relative overflow-hidden"
                  style={{ borderColor: `${color}40` }}
                >
                  <div
                    className="absolute top-0 left-0 right-0 h-1"
                    style={{ backgroundColor: color }}
                  />
                  <div className="flex items-center justify-between pb-2 border-b border-slate-800/70">
                    <div className="flex items-center gap-2.5">
                      <div
                        className="w-7 h-7 rounded-lg flex items-center justify-center font-bold text-xs"
                        style={{ backgroundColor: `${color}20`, color }}
                      >
                        {c.name.charAt(0).toUpperCase()}
                      </div>
                      <div>
                        <h4 className="text-xs font-bold text-white font-mono truncate max-w-[140px]">
                          {c.name}
                        </h4>
                        <span className="text-[10px] text-slate-400 font-mono">{c.id.slice(0, 12)}</span>
                      </div>
                    </div>
                    <StatusBadge status={c.status} size="sm" />
                  </div>

                  {/* Badges for Highest Consumer */}
                  {stats && (
                    <div className="flex flex-wrap gap-1">
                      {stats.is_highest_cpu && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono font-semibold px-2 py-0.5 rounded bg-red-500/10 text-red-400 border border-red-500/20">
                          <Crown className="w-2.5 h-2.5" /> High CPU
                        </span>
                      )}
                      {stats.is_highest_memory && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono font-semibold px-2 py-0.5 rounded bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          <Crown className="w-2.5 h-2.5" /> High RAM
                        </span>
                      )}
                      {stats.is_highest_network && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <Crown className="w-2.5 h-2.5" /> High Net
                        </span>
                      )}
                      {stats.is_highest_disk && (
                        <span className="inline-flex items-center gap-1 text-[9px] font-mono font-semibold px-2 py-0.5 rounded bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          <Crown className="w-2.5 h-2.5" /> High Disk
                        </span>
                      )}
                    </div>
                  )}

                  {/* Resource Gauges */}
                  <div className="space-y-2 text-xs">
                    <div>
                      <div className="flex justify-between text-slate-400 mb-1 text-[11px]">
                        <span>CPU Load</span>
                        <span className="text-white font-mono font-semibold">{cpuUsage.toFixed(1)}%</span>
                      </div>
                      <ProgressBar value={cpuUsage} size="sm" color="blue" />
                    </div>
                    <div>
                      <div className="flex justify-between text-slate-400 mb-1 text-[11px]">
                        <span>RAM Load</span>
                        <span className="text-white font-mono font-semibold">
                          {formatBytes(memUsage)} ({memPct.toFixed(1)}%)
                        </span>
                      </div>
                      <ProgressBar value={memPct} size="sm" color="purple" />
                    </div>

                    {!isDemoMode && stats && (
                      <div className="p-2 rounded bg-slate-900/60 border border-slate-800/80 space-y-1 text-[10px] font-mono text-slate-300">
                        <div className="flex justify-between">
                          <span className="text-slate-400">Avg / Peak CPU:</span>
                          <span className="text-white">{stats.avg_cpu}% / {stats.peak_cpu}%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Avg / Peak RAM:</span>
                          <span className="text-white">{stats.avg_memory_mb} MB / {stats.peak_memory_mb} MB</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-400">Total Net / Disk:</span>
                          <span className="text-white">
                            {formatBytes(stats.total_network_bytes)} / {formatBytes(stats.total_disk_bytes)}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 4 Comparative Overlay Charts */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* CPU Chart */}
            <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Cpu className="w-4 h-4 text-blue-400" />
                  <h3 className="text-sm font-bold text-white">CPU Load Overlay (%)</h3>
                </div>
                {!isDemoMode && (
                  <span className="text-[10px] text-blue-400 bg-blue-500/10 border border-blue-500/20 px-2 py-0.5 rounded-full font-mono">
                    {timeRange.toUpperCase()}
                  </span>
                )}
              </div>
              {loading ? (
                <div className="h-48 flex items-center justify-center text-xs text-slate-400 gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-blue-400" />
                  <span>Loading CPU metrics...</span>
                </div>
              ) : (
                <LineChart
                  data={chartData}
                  lines={selectedContainers.map((c) => ({
                    key: `cpu_${c.id}`,
                    color: colorMap[c.id],
                    label: c.name,
                  }))}
                  height={220}
                  yDomain={[0, 100]}
                  formatYAxis={(v) => `${v}%`}
                />
              )}
            </div>

            {/* Memory Chart */}
            <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <MemoryStick className="w-4 h-4 text-purple-400" />
                  <h3 className="text-sm font-bold text-white">Memory Allocation Overlay (MB)</h3>
                </div>
                {!isDemoMode && (
                  <span className="text-[10px] text-purple-400 bg-purple-500/10 border border-purple-500/20 px-2 py-0.5 rounded-full font-mono">
                    {timeRange.toUpperCase()}
                  </span>
                )}
              </div>
              {loading ? (
                <div className="h-48 flex items-center justify-center text-xs text-slate-400 gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-purple-400" />
                  <span>Loading memory metrics...</span>
                </div>
              ) : (
                <LineChart
                  data={chartData}
                  lines={selectedContainers.map((c) => ({
                    key: `mem_${c.id}`,
                    color: colorMap[c.id],
                    label: c.name,
                  }))}
                  height={220}
                  yDomain={['auto', 'auto']}
                  formatYAxis={(v) => `${Math.round(v)} MB`}
                />
              )}
            </div>

            {/* Network Throughput Chart */}
            <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <Network className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-bold text-white">Network RX Throughput (KB/s)</h3>
                </div>
                {!isDemoMode && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono">
                    {timeRange.toUpperCase()}
                  </span>
                )}
              </div>
              {loading ? (
                <div className="h-48 flex items-center justify-center text-xs text-slate-400 gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-emerald-400" />
                  <span>Loading network metrics...</span>
                </div>
              ) : (
                <LineChart
                  data={chartData}
                  lines={selectedContainers.map((c) => ({
                    key: `rx_${c.id}`,
                    color: colorMap[c.id],
                    label: c.name,
                  }))}
                  height={220}
                  yDomain={['auto', 'auto']}
                  formatYAxis={(v) => `${v.toFixed(1)} KB/s`}
                />
              )}
            </div>

            {/* Disk I/O Chart */}
            <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <HardDrive className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-white">Disk I/O Activity (KB/s)</h3>
                </div>
                {!isDemoMode && (
                  <span className="text-[10px] text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full font-mono">
                    {timeRange.toUpperCase()}
                  </span>
                )}
              </div>
              {loading ? (
                <div className="h-48 flex items-center justify-center text-xs text-slate-400 gap-2">
                  <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
                  <span>Loading disk metrics...</span>
                </div>
              ) : (
                <LineChart
                  data={chartData}
                  lines={selectedContainers.map((c) => ({
                    key: `disk_${c.id}`,
                    color: colorMap[c.id],
                    label: c.name,
                  }))}
                  height={220}
                  yDomain={['auto', 'auto']}
                  formatYAxis={(v) => `${v.toFixed(1)} KB/s`}
                />
              )}
            </div>
          </div>

          {/* Resource Utilization Benchmark Table */}
          <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Resource Consumption Benchmark Matrix</h3>
                <p className="text-xs text-slate-400">
                  Comprehensive historical breakdown across selected container cluster nodes
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/40">
                    <th className="py-2.5 px-3">Container</th>
                    <th className="py-2.5 px-3">Status</th>
                    <th className="py-2.5 px-3">Avg CPU</th>
                    <th className="py-2.5 px-3">Peak CPU</th>
                    <th className="py-2.5 px-3">Avg RAM</th>
                    <th className="py-2.5 px-3">Peak RAM</th>
                    <th className="py-2.5 px-3">Total Net</th>
                    <th className="py-2.5 px-3">Total Disk</th>
                    <th className="py-2.5 px-3">Dominant Impact</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {selectedContainers.map((c) => {
                    const stats = statsMap[c.id];
                    const color = colorMap[c.id];
                    return (
                      <tr key={c.id} className="hover:bg-slate-800/30 transition-colors">
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />
                            <div>
                              <span className="font-semibold text-white">{c.name}</span>
                              <div className="text-[10px] text-slate-400">{c.id.slice(0, 12)}</div>
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3">
                          <StatusBadge status={c.status} size="sm" />
                        </td>
                        <td className="py-2.5 px-3 text-slate-200">
                          {stats ? `${stats.avg_cpu}%` : `${c.cpu_percent.toFixed(1)}%`}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-blue-400">
                          {stats ? `${stats.peak_cpu}%` : `${(c.cpu_percent * 1.3).toFixed(1)}%`}
                        </td>
                        <td className="py-2.5 px-3 text-slate-200">
                          {stats ? `${stats.avg_memory_mb} MB` : formatBytes(c.memory_usage)}
                        </td>
                        <td className="py-2.5 px-3 font-semibold text-purple-400">
                          {stats ? `${stats.peak_memory_mb} MB` : formatBytes(c.memory_usage * 1.2)}
                        </td>
                        <td className="py-2.5 px-3 text-emerald-400">
                          {stats ? formatBytes(stats.total_network_bytes) : formatBytes(c.network_rx + c.network_tx)}
                        </td>
                        <td className="py-2.5 px-3 text-amber-400">
                          {stats ? formatBytes(stats.total_disk_bytes) : '0 B'}
                        </td>
                        <td className="py-2.5 px-3">
                          {stats?.is_highest_cpu ? (
                            <span className="text-[10px] text-red-400 font-semibold">Highest CPU</span>
                          ) : stats?.is_highest_memory ? (
                            <span className="text-[10px] text-purple-400 font-semibold">Highest RAM</span>
                          ) : stats?.is_highest_network ? (
                            <span className="text-[10px] text-emerald-400 font-semibold">Highest Net</span>
                          ) : (
                            <span className="text-[10px] text-slate-500">Normal</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
