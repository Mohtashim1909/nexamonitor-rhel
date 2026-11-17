import React, { useMemo, useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Boxes,
  Cpu,
  HardDrive,
  Network,
  Activity,
  Layers,
  MemoryStick,
  ArrowUpRight,
  TrendingUp,
  Lightbulb,
  Sparkles,
  ShieldAlert,
} from 'lucide-react';
import { MetricCard } from '@/components/shared/MetricCard';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { AlertCard } from '@/components/shared/AlertCard';
import { DemoModeBanner, LiveModeBanner } from '@/components/shared/DemoModeBanner';
import { LineChart } from '@/components/charts/LineChart';
import { DonutChart } from '@/components/charts/DonutChart';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { useApp } from '@/context/AppContext';
import { formatBytes, formatPercent } from '@/utils/format';
import { generateCpuSeries, generateNetworkSeries } from '@/data/demo';
import { api } from '@/services/api';
import { clsx } from 'clsx';
import type { InsightsSummary } from '@/types';

const cpuData = generateCpuSeries(30, 36);
const networkData = generateNetworkSeries(30);

export function OverviewPage() {
  const {
    containers,
    systemMetrics,
    alerts,
    isDemoMode,
    acknowledgeAlert,
    chartHistory,
    wsStatus,
    lastMetricTime,
  } = useApp();
  const navigate = useNavigate();

  const [insightsSummary, setInsightsSummary] = useState<InsightsSummary | null>(null);

  useEffect(() => {
    if (isDemoMode) {
      setInsightsSummary({
        total: 2,
        critical: 0,
        warning: 1,
        info: 1,
        by_category: { cpu: 0, memory: 1, stability: 0, network: 0, optimization: 1 },
        insights: [
          {
            id: 'ins-demo-1',
            rule_id: 'MEM_STABLE',
            container_id: 'c1',
            container_name: 'nexamonitor-core',
            category: 'memory',
            severity: 'warning',
            title: 'Memory Utilization Approaching 80%',
            description: 'Core container allocation is approaching configured threshold.',
            recommendation: 'Evaluate increasing container memory reservation to 1024MB.',
            metrics: { memory_percent: 78.5 },
            detected_at: new Date().toISOString(),
          },
        ],
        generated_at: new Date().toISOString(),
      });
      return;
    }

    api.insights
      .summary()
      .then((data) => setInsightsSummary(data))
      .catch(() => {});
  }, [isDemoMode]);

  const running = containers.filter((c) => c.status === 'running').length;
  const stopped = containers.filter((c) => c.status !== 'running').length;
  const activeAlerts = alerts.filter((a) => !a.is_acknowledged);

  const liveChartData = useMemo(() => {
    if (!isDemoMode && chartHistory.length > 1) {
      return chartHistory;
    }
    return cpuData;
  }, [isDemoMode, chartHistory]);

  const statusDist = useMemo(
    () =>
      [
        { name: 'Running', value: running, color: '#10b981' },
        {
          name: 'Stopped',
          value: containers.filter((c) => c.status === 'stopped' || c.status === 'exited').length,
          color: '#f43f5e',
        },
        {
          name: 'Paused',
          value: containers.filter((c) => c.status === 'paused').length,
          color: '#f59e0b',
        },
      ].filter((d) => d.value > 0),
    [containers, running]
  );

  const topContainers = [...containers]
    .filter((c) => c.status === 'running')
    .sort((a, b) => b.cpu_percent - a.cpu_percent)
    .slice(0, 5);

  return (
    <div className="space-y-6">
      {isDemoMode ? <DemoModeBanner /> : <LiveModeBanner />}

      <PageHeader
        title="Infrastructure Overview"
        subtitle="Global resource telemetry and container orchestration health"
        badge={`${containers.length} Managed Containers`}
      />

      {/* Smart Resource Insights Banner */}
      {insightsSummary && insightsSummary.insights.length > 0 && (
        <div className="bg-gradient-to-r from-blue-950/40 via-purple-950/30 to-slate-900/40 border border-blue-500/30 rounded-xl p-4 shadow-lg shadow-black/20 space-y-2">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-blue-500/10 border border-blue-500/30 flex items-center justify-center text-blue-400">
                <Sparkles className="w-4 h-4" />
              </div>
              <div>
                <h4 className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-2">
                  <span>Smart Resource Optimization Recommendations</span>
                  <span className="text-[10px] bg-blue-500/20 text-blue-300 px-2 py-0.5 rounded-full font-mono">
                    {insightsSummary.total} Active Finding{insightsSummary.total !== 1 ? 's' : ''}
                  </span>
                </h4>
              </div>
            </div>
            <button
              onClick={() => navigate('/analytics')}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
            >
              <span>Explore Analytics</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
            {insightsSummary.insights.slice(0, 2).map((ins) => (
              <div
                key={ins.id}
                onClick={() => navigate(`/containers/${ins.container_id}`)}
                className="bg-slate-900/70 border border-slate-800 hover:border-blue-500/40 rounded-lg p-2.5 cursor-pointer transition-all space-y-1"
              >
                <div className="flex items-center justify-between text-[11px]">
                  <span className="font-semibold text-white font-mono">{ins.container_name}</span>
                  <span
                    className={clsx(
                      'px-1.5 py-0.2 rounded text-[9px] font-mono uppercase font-bold',
                      ins.severity === 'critical'
                        ? 'bg-red-500/20 text-red-400'
                        : ins.severity === 'warning'
                        ? 'bg-amber-500/20 text-amber-400'
                        : 'bg-blue-500/20 text-blue-400'
                    )}
                  >
                    {ins.severity}
                  </span>
                </div>
                <div className="text-xs text-slate-300 font-medium">{ins.title}</div>
                <div className="text-[11px] text-slate-400 line-clamp-1">{ins.recommendation}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Top Metric Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Total Containers"
          value={containers.length}
          icon={Boxes}
          iconColor="text-blue-400"
          iconBg="bg-blue-500/10 border-blue-500/25"
          subtitle={`${running} active • ${stopped} inactive`}
          trend={{ value: 12.5, label: 'this week' }}
        />
        <MetricCard
          title="Host CPU Utilization"
          value={formatPercent(systemMetrics.cpu.percent)}
          icon={Cpu}
          iconColor="text-cyan-400"
          iconBg="bg-cyan-500/10 border-cyan-500/25"
          subtitle={`${systemMetrics.cpu.count_logical} vCPUs active`}
          trend={{ value: -3.2, label: 'vs avg' }}
        />
        <MetricCard
          title="Host Memory Usage"
          value={formatPercent(systemMetrics.memory.percent)}
          icon={MemoryStick}
          iconColor="text-purple-400"
          iconBg="bg-purple-500/10 border-purple-500/25"
          subtitle={`${formatBytes(systemMetrics.memory.used)} / ${formatBytes(systemMetrics.memory.total)}`}
        />
        <MetricCard
          title="Root Storage Usage"
          value={formatPercent(systemMetrics.disk.percent)}
          icon={HardDrive}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/10 border-amber-500/25"
          subtitle={`${formatBytes(systemMetrics.disk.used)} consumed`}
        />
      </div>

      {/* Primary Analytics Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CPU & Memory Trends (2 cols) */}
        <div className="lg:col-span-2 bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>Cluster Resource Telemetry</span>
                <span className="text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-full font-mono flex items-center gap-1">
                  {!isDemoMode && wsStatus === 'CONNECTED' && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />}
                  {!isDemoMode ? 'Real-Time Stream' : 'Live 60m (Demo)'}
                </span>
                {!isDemoMode && lastMetricTime && (
                  <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                    Updated: {new Date(lastMetricTime).toLocaleTimeString()}
                  </span>
                )}
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Aggregate CPU load and virtual memory allocation
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> CPU Load
              </span>
              <span className="flex items-center gap-1.5 text-slate-300">
                <span className="w-2.5 h-2.5 rounded-full bg-purple-500" /> RAM Alloc
              </span>
            </div>
          </div>
          <LineChart
            data={liveChartData}
            lines={[
              { key: 'cpu', color: '#3b82f6', label: 'CPU %' },
              { key: 'memory', color: '#8b5cf6', label: 'Memory (MB)' },
            ]}
            height={220}
          />
        </div>

        {/* Container Status Distribution (1 col) */}
        <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white">Container State Distribution</h3>
            <p className="text-xs text-slate-400 mt-0.5">Real-time status breakdown</p>
          </div>
          <div className="py-2">
            <DonutChart data={statusDist} height={160} />
          </div>
          <div className="space-y-2 pt-2 border-t border-slate-800/60">
            {statusDist.map((d) => (
              <div key={d.name} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full" style={{ background: d.color }} />
                  <span className="text-slate-300">{d.name}</span>
                </div>
                <span className="text-white font-mono font-bold">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Network Traffic + Top Consumers */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Network Traffic */}
        <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Network className="w-4 h-4 text-cyan-400" />
                <span>Network I/O Throughput</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">Inbound vs outbound data rates (KB/s)</p>
            </div>
          </div>
          <LineChart
            data={networkData}
            lines={[
              { key: 'network_rx', color: '#06b6d4', label: 'RX' },
              { key: 'network_tx', color: '#a855f7', label: 'TX' },
            ]}
            height={190}
            yDomain={[0, 600]}
            formatYAxis={(v) => `${v}`}
          />
        </div>

        {/* Top Resource Consuming Containers */}
        <div className="lg:col-span-2 bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white">Top Resource-Consuming Containers</h3>
              <p className="text-xs text-slate-400 mt-0.5">Ranked by instantaneous compute load</p>
            </div>
            <button
              onClick={() => navigate('/containers')}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
            >
              <span>View All</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="space-y-3.5">
            {topContainers.map((c) => (
              <div
                key={c.id}
                onClick={() => navigate(`/containers/${c.id}`)}
                className="flex items-center gap-4 cursor-pointer hover:bg-slate-800/40 rounded-lg p-2.5 -mx-2 transition-all border border-transparent hover:border-slate-700/50"
              >
                <div className="w-32 min-w-0">
                  <div className="text-sm text-white font-medium truncate font-mono">{c.name}</div>
                  <div className="text-xs text-slate-400 truncate">{c.image}</div>
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">CPU</span>
                    <span className="text-slate-200 font-mono font-medium">{c.cpu_percent.toFixed(1)}%</span>
                  </div>
                  <ProgressBar value={c.cpu_percent} size="sm" />
                </div>
                <div className="flex-1">
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">RAM</span>
                    <span className="text-slate-200 font-mono font-medium">{c.memory_percent.toFixed(1)}%</span>
                  </div>
                  <ProgressBar value={c.memory_percent} size="sm" color="purple" />
                </div>
                <div className="w-24 text-right flex-shrink-0">
                  <StatusBadge status={c.status} size="sm" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Recent Alerts Feed */}
      {activeAlerts.length > 0 && (
        <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-white">Active System Notifications & Alerts</h3>
              <p className="text-xs text-slate-400 mt-0.5">Threshold violations needing acknowledgement</p>
            </div>
            <button
              onClick={() => navigate('/alerts')}
              className="text-xs text-blue-400 hover:text-blue-300 font-medium flex items-center gap-1 transition-colors"
            >
              <span>Alert Center</span>
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {activeAlerts.slice(0, 4).map((alert) => (
              <AlertCard key={alert.id} alert={alert} onAcknowledge={acknowledgeAlert} compact />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
