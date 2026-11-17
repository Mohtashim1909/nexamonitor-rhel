import React, { useMemo } from 'react';
import {
  Monitor,
  Cpu,
  MemoryStick,
  HardDrive,
  Network,
  Clock,
  Server,
  Activity,
  Layers,
  CheckCircle2,
  Database,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { MetricCard } from '@/components/shared/MetricCard';
import { DemoModeBanner } from '@/components/shared/DemoModeBanner';
import { AreaChart } from '@/components/charts/AreaChart';
import { LineChart } from '@/components/charts/LineChart';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { useApp } from '@/context/AppContext';
import { formatBytes, formatPercent, formatUptime } from '@/utils/format';
import { generateCpuSeries, generateNetworkSeries } from '@/data/demo';

const cpuData = generateCpuSeries(30, 34);
const netData = generateNetworkSeries(30);

export function SystemHealthPage() {
  const { systemMetrics, isDemoMode } = useApp();
  const { cpu, memory, disk, network, system } = systemMetrics;

  return (
    <div className="space-y-6">
      {isDemoMode && <DemoModeBanner />}

      <PageHeader
        title="Linux Host Health & Telemetry"
        subtitle="Hardware resource saturation, operating system kernel statistics and node vitals"
        badge={system.hostname}
      />

      {/* Host Specs Banner */}
      <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
        <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-4">
          Node Hardware & Environment Information
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
          {[
            { label: 'Host Machine', value: system.hostname, icon: Server },
            { label: 'OS & Kernel', value: system.os, icon: Monitor },
            { label: 'Architecture', value: system.architecture, icon: Cpu },
            { label: 'System Uptime', value: formatUptime(system.uptime_seconds), icon: Clock },
            { label: 'Compute Cores', value: `${cpu.count_physical} Cores (${cpu.count_logical} Threads)`, icon: Activity },
            { label: 'Physical RAM', value: formatBytes(memory.total), icon: MemoryStick },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center flex-shrink-0 text-blue-400">
                <item.icon className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="text-[11px] text-slate-400">{item.label}</div>
                <div className="text-xs text-white font-semibold truncate" title={item.value}>
                  {item.value}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Resource Utilization Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard
          title="Overall CPU Load"
          value={formatPercent(cpu.percent)}
          icon={Cpu}
          iconColor="text-blue-400"
          iconBg="bg-blue-500/10 border-blue-500/25"
          subtitle={`${cpu.freq_current.toFixed(0)} MHz base clock`}
        />
        <MetricCard
          title="RAM In Use"
          value={formatBytes(memory.used)}
          icon={MemoryStick}
          iconColor="text-purple-400"
          iconBg="bg-purple-500/10 border-purple-500/25"
          subtitle={`${formatPercent(memory.percent)} of ${formatBytes(memory.total)}`}
        />
        <MetricCard
          title="Storage Consumption"
          value={formatBytes(disk.used)}
          icon={HardDrive}
          iconColor="text-amber-400"
          iconBg="bg-amber-500/10 border-amber-500/25"
          subtitle={`${formatPercent(disk.percent)} of ${formatBytes(disk.total)}`}
        />
        <MetricCard
          title="Network Ingress"
          value={formatBytes(network.bytes_recv)}
          icon={Network}
          iconColor="text-cyan-400"
          iconBg="bg-cyan-500/10 border-cyan-500/25"
          subtitle={`Sent: ${formatBytes(network.bytes_sent)}`}
        />
      </div>

      {/* Host Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
          <h3 className="text-sm font-bold text-white mb-1">Host CPU Activity</h3>
          <p className="text-xs text-slate-400 mb-4">Percentage compute capacity consumed across all cores</p>
          <AreaChart data={cpuData} dataKey="cpu" color="#3b82f6" height={190} label="CPU %" />
        </div>

        <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
          <h3 className="text-sm font-bold text-white mb-1">Physical RAM Saturation</h3>
          <p className="text-xs text-slate-400 mb-4">Total virtual memory allocated by processes</p>
          <AreaChart data={cpuData} dataKey="memory" color="#8b5cf6" height={190} label="RAM %" />
        </div>
      </div>

      {/* Per-Core Breakdown & Disk Analysis */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Core breakdown */}
        <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
          <h3 className="text-sm font-bold text-white mb-1">Per-CPU Core Telemetry</h3>
          <p className="text-xs text-slate-400 mb-4">Load distribution across logical threads</p>
          <div className="space-y-3">
            {cpu.per_cpu.map((pct, idx) => (
              <div key={idx} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400 font-mono">vCPU #{idx}</span>
                  <span className="text-slate-200 font-mono font-medium">{pct}%</span>
                </div>
                <ProgressBar value={pct} size="sm" />
              </div>
            ))}
          </div>
        </div>

        {/* Network Throughput */}
        <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20">
          <h3 className="text-sm font-bold text-white mb-1">Network Interface Telemetry</h3>
          <p className="text-xs text-slate-400 mb-4">Packets transferred via eth0</p>
          <LineChart
            data={netData}
            lines={[
              { key: 'network_rx', color: '#06b6d4', label: 'RX KB/s' },
              { key: 'network_tx', color: '#a855f7', label: 'TX KB/s' },
            ]}
            height={160}
            yDomain={[0, 600]}
            formatYAxis={(v) => `${v}`}
          />
          <div className="grid grid-cols-2 gap-3 mt-4 text-xs font-mono">
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 text-[11px] block">RX Packets</span>
              <span className="text-cyan-400 font-bold text-sm">
                {network.packets_recv.toLocaleString()}
              </span>
            </div>
            <div className="bg-slate-900/60 p-2.5 rounded-lg border border-slate-800">
              <span className="text-slate-400 text-[11px] block">TX Packets</span>
              <span className="text-purple-400 font-bold text-sm">
                {network.packets_sent.toLocaleString()}
              </span>
            </div>
          </div>
        </div>

        {/* Disk & Swap Specs */}
        <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-bold text-white mb-1">Disk Volumes & Swap</h3>
            <p className="text-xs text-slate-400 mb-4">Root filesystem partition stats</p>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-400">Root File System (/)</span>
                  <span className="text-amber-400 font-mono font-bold">
                    {formatPercent(disk.percent)}
                  </span>
                </div>
                <ProgressBar value={disk.percent} color="yellow" />
                <div className="flex justify-between text-[11px] text-slate-400 mt-1 font-mono">
                  <span>Used: {formatBytes(disk.used)}</span>
                  <span>Free: {formatBytes(disk.free)}</span>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-800/80">
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-400">Swap Memory</span>
                  <span className="text-purple-400 font-mono font-bold">
                    {formatPercent(memory.swap_percent)}
                  </span>
                </div>
                <ProgressBar value={memory.swap_percent} color="purple" />
                <div className="flex justify-between text-[11px] text-slate-400 mt-1 font-mono">
                  <span>Used: {formatBytes(memory.swap_used)}</span>
                  <span>Total: {formatBytes(memory.swap_total)}</span>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-800/80 text-xs text-slate-400 font-mono flex justify-between">
            <span>Disk Read: {formatBytes(disk.read_bytes)}</span>
            <span>Disk Write: {formatBytes(disk.write_bytes)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
