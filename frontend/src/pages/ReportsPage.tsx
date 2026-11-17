import React, { useState, useEffect } from 'react';
import {
  FileText,
  Download,
  Calendar,
  CheckCircle,
  FileSpreadsheet,
  Clock,
  Boxes,
  Cpu,
  MemoryStick,
  Network,
  HardDrive,
  AlertTriangle,
  RefreshCw,
  TrendingUp,
  RotateCcw,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DemoModeBanner } from '@/components/shared/DemoModeBanner';
import { useApp } from '@/context/AppContext';
import { formatBytes, formatPercent } from '@/utils/format';
import { api } from '@/services/api';
import { clsx } from 'clsx';
import type { MonitoringReport } from '@/types';

export function ReportsPage() {
  const { containers, systemMetrics, isDemoMode } = useApp();
  const [selectedReportType, setSelectedReportType] = useState<'daily' | 'weekly' | 'custom'>('daily');
  const [customStart, setCustomStart] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 3);
    return d.toISOString().slice(0, 16);
  });
  const [customEnd, setCustomEnd] = useState(() => new Date().toISOString().slice(0, 16));
  const [reportData, setReportData] = useState<MonitoringReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloadNotice, setDownloadNotice] = useState<string | null>(null);

  // Fetch report data
  const loadReport = () => {
    if (isDemoMode) {
      // Demo fallback report
      setReportData({
        summary: {
          report_type: selectedReportType,
          start_time: new Date(Date.now() - 86400000).toISOString(),
          end_time: new Date().toISOString(),
          total_containers_tracked: containers.length,
          total_metric_samples: 17280,
          total_alerts_count: 3,
          critical_alerts_count: 1,
          warning_alerts_count: 2,
          avg_cpu_percent: 18.4,
          peak_cpu_percent: 82.1,
          peak_cpu_container: containers[0]?.name || 'nexamonitor-core',
          avg_memory_mb: 486.2,
          peak_memory_mb: 1420.5,
          peak_memory_container: containers[1]?.name || 'nexamonitor-db',
          total_network_rx_mb: 245.8,
          total_network_tx_mb: 189.4,
          total_disk_read_mb: 112.5,
          total_disk_write_mb: 84.2,
          container_restarts_detected: 0,
        },
        containers: containers.map((c) => ({
          container_id: c.id,
          container_name: c.name,
          avg_cpu_percent: c.cpu_percent,
          peak_cpu_percent: Math.min(100, c.cpu_percent * 1.5),
          avg_memory_mb: Math.round(c.memory_usage / (1024 * 1024)),
          peak_memory_mb: Math.round((c.memory_usage / (1024 * 1024)) * 1.25),
          network_rx_mb: 45.2,
          network_tx_mb: 32.1,
          disk_read_mb: 15.0,
          disk_write_mb: 8.5,
          alert_count: 1,
        })),
        top_consumers: {
          by_cpu: containers.slice(0, 3).map((c) => ({ container_name: c.name, value: c.cpu_percent })),
          by_memory: containers.slice(0, 3).map((c) => ({ container_name: c.name, value: Math.round(c.memory_usage / (1024 * 1024)) })),
          by_network: containers.slice(0, 3).map((c) => ({ container_name: c.name, value: 45.2 })),
        },
      });
      return;
    }

    setLoading(true);
    let promise: Promise<MonitoringReport>;
    if (selectedReportType === 'daily') {
      promise = api.reports.daily();
    } else if (selectedReportType === 'weekly') {
      promise = api.reports.weekly();
    } else {
      promise = api.reports.custom(new Date(customStart).toISOString(), new Date(customEnd).toISOString());
    }

    promise
      .then((data) => {
        setReportData(data);
      })
      .catch((err) => {
        setDownloadNotice(`Failed to generate report: ${err?.message || err}`);
      })
      .finally(() => {
        setLoading(false);
      });
  };

  useEffect(() => {
    loadReport();
  }, [selectedReportType, isDemoMode]);

  const handleDownloadCsv = () => {
    if (isDemoMode) {
      setDownloadNotice('Downloaded simulated CSV audit digest.');
      setTimeout(() => setDownloadNotice(null), 3000);
      return;
    }

    const start = selectedReportType === 'custom' ? new Date(customStart).toISOString() : undefined;
    const end = selectedReportType === 'custom' ? new Date(customEnd).toISOString() : undefined;
    const url = api.reports.downloadCsvUrl(selectedReportType, start, end);
    window.open(url, '_blank');
    setDownloadNotice('Initiated CSV report download.');
    setTimeout(() => setDownloadNotice(null), 3500);
  };

  const handleDownloadPdf = () => {
    if (isDemoMode) {
      setDownloadNotice('PDF report download prepared for demo containers.');
      setTimeout(() => setDownloadNotice(null), 3000);
      return;
    }

    const start = selectedReportType === 'custom' ? new Date(customStart).toISOString() : undefined;
    const end = selectedReportType === 'custom' ? new Date(customEnd).toISOString() : undefined;
    const url = api.reports.downloadPdfUrl(selectedReportType, start, end);
    window.open(url, '_blank');
    setDownloadNotice('Initiated professional ReportLab PDF download.');
    setTimeout(() => setDownloadNotice(null), 3500);
  };

  return (
    <div className="space-y-6">
      {isDemoMode && <DemoModeBanner />}

      {downloadNotice && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs px-4 py-2.5 rounded-lg flex items-center justify-between animate-slide-in">
          <span>{downloadNotice}</span>
          <button onClick={() => setDownloadNotice(null)} className="text-emerald-400 hover:text-white font-bold ml-4">
            ×
          </button>
        </div>
      )}

      <PageHeader
        title="Monitoring Reports & Executive Audits"
        subtitle="Automated daily digests, weekly capacity audits, RFC4180 CSV logs, and professional PDF reports"
        badge="Audit Engine Active"
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadCsv}
              className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700/80 rounded-lg text-xs font-semibold transition-colors"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handleDownloadPdf}
              className="flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-colors shadow-lg shadow-blue-900/30"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Download PDF</span>
            </button>
          </div>
        }
      />

      {/* Preset and Date-Range Selector Bar */}
      <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-4 shadow-lg shadow-black/20 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <div className="flex gap-1 bg-slate-900 border border-slate-800 rounded-lg p-1">
            {(['daily', 'weekly', 'custom'] as const).map((type) => (
              <button
                key={type}
                onClick={() => setSelectedReportType(type)}
                className={clsx(
                  'px-3.5 py-1.5 rounded-md text-xs font-medium transition-all capitalize',
                  selectedReportType === type
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {type === 'daily' ? 'Past 24 Hours' : type === 'weekly' ? 'Past 7 Days' : 'Custom Window'}
              </button>
            ))}
          </div>

          <button
            onClick={loadReport}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors"
            title="Refresh Report"
          >
            <RefreshCw className={clsx('w-3.5 h-3.5', loading && 'animate-spin text-blue-400')} />
          </button>
        </div>

        {selectedReportType === 'custom' && (
          <div className="flex flex-wrap items-center gap-3 text-xs font-mono">
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">From:</span>
              <input
                type="datetime-local"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-slate-200 px-2.5 py-1.5 rounded-lg focus:border-blue-500 outline-none"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-slate-400">To:</span>
              <input
                type="datetime-local"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="bg-slate-900 border border-slate-800 text-slate-200 px-2.5 py-1.5 rounded-lg focus:border-blue-500 outline-none"
              />
            </div>
            <button
              onClick={loadReport}
              className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold"
            >
              Apply Filter
            </button>
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-20 flex flex-col items-center justify-center gap-3 text-slate-400 text-xs">
          <RefreshCw className="w-6 h-6 animate-spin text-blue-400" />
          <span>Generating aggregated cluster report metrics...</span>
        </div>
      ) : reportData ? (
        <>
          {/* Executive KPI Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-4 shadow-lg shadow-black/20 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Cluster Compute</span>
                <Cpu className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-xl font-bold font-mono text-white">
                {reportData.summary.avg_cpu_percent.toFixed(1)}%
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Peak: <span className="text-blue-400">{reportData.summary.peak_cpu_percent.toFixed(1)}%</span>
                {reportData.summary.peak_cpu_container && ` (${reportData.summary.peak_cpu_container})`}
              </div>
            </div>

            <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-4 shadow-lg shadow-black/20 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Memory Allocation</span>
                <MemoryStick className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-xl font-bold font-mono text-white">
                {reportData.summary.avg_memory_mb.toFixed(0)} MB
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                Peak: <span className="text-purple-400">{reportData.summary.peak_memory_mb.toFixed(0)} MB</span>
                {reportData.summary.peak_memory_container && ` (${reportData.summary.peak_memory_container})`}
              </div>
            </div>

            <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-4 shadow-lg shadow-black/20 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Network Data Volume</span>
                <Network className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold font-mono text-white">
                {(reportData.summary.total_network_rx_mb + reportData.summary.total_network_tx_mb).toFixed(1)} MB
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                RX: {reportData.summary.total_network_rx_mb.toFixed(1)} MB • TX: {reportData.summary.total_network_tx_mb.toFixed(1)} MB
              </div>
            </div>

            <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-4 shadow-lg shadow-black/20 space-y-1">
              <div className="flex items-center justify-between text-xs text-slate-400">
                <span>Incidents & Flapping</span>
                <AlertTriangle className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-xl font-bold font-mono text-white">
                {reportData.summary.total_alerts_count} Alerts
              </div>
              <div className="text-[11px] text-slate-400 font-mono">
                <span className="text-red-400">{reportData.summary.critical_alerts_count} Critical</span> •{' '}
                <span className="text-amber-400">{reportData.summary.warning_alerts_count} Warn</span> •{' '}
                {reportData.summary.container_restarts_detected} Restarts
              </div>
            </div>
          </div>

          {/* Breakdown Table: Container Metrics In Report Window */}
          <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 shadow-lg shadow-black/20 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-white">Container Workload Consumption Audit</h3>
                <p className="text-xs text-slate-400 font-mono">
                  {reportData.summary.total_metric_samples.toLocaleString()} samples recorded between{' '}
                  {new Date(reportData.summary.start_time).toLocaleString()} and{' '}
                  {new Date(reportData.summary.end_time).toLocaleString()}
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs font-mono">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 bg-slate-900/40">
                    <th className="py-2.5 px-3 text-left">Container</th>
                    <th className="py-2.5 px-3 text-left">Avg CPU</th>
                    <th className="py-2.5 px-3 text-left">Peak CPU</th>
                    <th className="py-2.5 px-3 text-left">Avg RAM</th>
                    <th className="py-2.5 px-3 text-left">Peak RAM</th>
                    <th className="py-2.5 px-3 text-left">Net RX / TX</th>
                    <th className="py-2.5 px-3 text-left">Disk I/O</th>
                    <th className="py-2.5 px-3 text-left">Alerts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 text-slate-300">
                  {reportData.containers.map((c) => (
                    <tr key={c.container_id} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-3 font-semibold text-white">
                        <div>{c.container_name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">{c.container_id.slice(0, 12)}</div>
                      </td>
                      <td className="py-2.5 px-3">{c.avg_cpu_percent.toFixed(1)}%</td>
                      <td className="py-2.5 px-3 text-blue-400 font-semibold">{c.peak_cpu_percent.toFixed(1)}%</td>
                      <td className="py-2.5 px-3">{c.avg_memory_mb.toFixed(0)} MB</td>
                      <td className="py-2.5 px-3 text-purple-400 font-semibold">{c.peak_memory_mb.toFixed(0)} MB</td>
                      <td className="py-2.5 px-3 text-emerald-400">
                        {c.network_rx_mb.toFixed(1)} / {c.network_tx_mb.toFixed(1)} MB
                      </td>
                      <td className="py-2.5 px-3 text-amber-400">
                        {(c.disk_read_mb + c.disk_write_mb).toFixed(1)} MB
                      </td>
                      <td className="py-2.5 px-3">
                        {c.alert_count > 0 ? (
                          <span className="text-red-400 font-bold">{c.alert_count}</span>
                        ) : (
                          <span className="text-slate-500">0</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
