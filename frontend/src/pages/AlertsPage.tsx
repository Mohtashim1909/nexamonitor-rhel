import React, { useState, useMemo, useEffect } from 'react';
import {
  Bell,
  CheckCheck,
  AlertTriangle,
  Info,
  SlidersHorizontal,
  ShieldAlert,
  Flame,
  CheckCircle2,
  Save,
  Check,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DemoModeBanner } from '@/components/shared/DemoModeBanner';
import { AlertCard } from '@/components/shared/AlertCard';
import { EmptyState } from '@/components/shared/EmptyState';
import { useApp } from '@/context/AppContext';
import { api } from '@/services/api';
import { clsx } from 'clsx';
import type { AlertSeverity } from '@/types';

type AlertFilter = 'all' | 'active' | 'resolved';
type SeverityFilter = AlertSeverity | 'all';

export function AlertsPage() {
  const { alerts, acknowledgeAlert, resolveAlert, acknowledgeAllAlerts, isDemoMode } = useApp();
  const [statusFilter, setStatusFilter] = useState<AlertFilter>('all');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('all');

  // Dynamic threshold configuration
  const [thresholds, setThresholds] = useState({
    cpuWarning: 75,
    cpuCritical: 90,
    memWarning: 80,
    memCritical: 90,
    diskWarning: 80,
    diskCritical: 95,
  });
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Fetch settings from AlertEngine in live mode
  useEffect(() => {
    if (isDemoMode) return;
    api.alerts
      .getSettings()
      .then((cfg) => {
        if (cfg) {
          setThresholds({
            cpuWarning: cfg.cpu_warning_threshold,
            cpuCritical: cfg.cpu_critical_threshold,
            memWarning: cfg.memory_warning_threshold,
            memCritical: cfg.memory_critical_threshold,
            diskWarning: cfg.disk_warning_threshold,
            diskCritical: cfg.disk_critical_threshold,
          });
        }
      })
      .catch((err) => console.debug('Could not load alert settings:', err));
  }, [isDemoMode]);

  const handleSaveThresholds = async () => {
    if (isDemoMode) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      return;
    }
    try {
      setIsSaving(true);
      await api.alerts.updateSettings({
        cpu_warning_threshold: thresholds.cpuWarning,
        cpu_critical_threshold: thresholds.cpuCritical,
        memory_warning_threshold: thresholds.memWarning,
        memory_critical_threshold: thresholds.memCritical,
        disk_warning_threshold: thresholds.diskWarning,
        disk_critical_threshold: thresholds.diskCritical,
      });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (e) {
      console.error('Failed to update alert thresholds', e);
    } finally {
      setIsSaving(false);
    }
  };

  const filtered = useMemo(
    () =>
      alerts
        .filter((a) => {
          const isResolved = a.status === 'RESOLVED';
          const isAcknowledged = a.is_acknowledged || a.status === 'ACKNOWLEDGED';

          const matchStatus =
            statusFilter === 'all' ||
            (statusFilter === 'active' && !isAcknowledged && !isResolved) ||
            (statusFilter === 'resolved' && isResolved);

          const matchSeverity = severityFilter === 'all' || a.severity === severityFilter;
          return matchStatus && matchSeverity;
        })
        .sort(
          (a, b) =>
            new Date(b.triggered_at || b.created_at).getTime() -
            new Date(a.triggered_at || a.created_at).getTime()
        ),
    [alerts, statusFilter, severityFilter]
  );

  const counts = {
    critical: alerts.filter(
      (a) => a.severity === 'critical' && !a.is_acknowledged && a.status !== 'RESOLVED'
    ).length,
    warning: alerts.filter(
      (a) => a.severity === 'warning' && !a.is_acknowledged && a.status !== 'RESOLVED'
    ).length,
    info: alerts.filter(
      (a) => a.severity === 'info' && !a.is_acknowledged && a.status !== 'RESOLVED'
    ).length,
    active: alerts.filter((a) => !a.is_acknowledged && a.status !== 'RESOLVED').length,
  };

  return (
    <div className="space-y-6">
      {isDemoMode && <DemoModeBanner />}

      <PageHeader
        title="Alert Center & Notifications"
        subtitle="Real-time incident detection, threshold violations and rule management"
        badge={counts.active > 0 ? `${counts.active} Unacknowledged` : 'Operational Normal'}
        actions={
          counts.active > 0 && (
            <button
              onClick={acknowledgeAllAlerts}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-all border border-slate-700/60 shadow-sm"
            >
              <CheckCheck className="w-4 h-4 text-emerald-400" />
              <span>Acknowledge All ({counts.active})</span>
            </button>
          )
        }
      />

      {/* Triage Severity Metric Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[
          {
            label: 'Critical Priority',
            count: counts.critical,
            color: 'text-rose-400',
            bg: 'bg-rose-500/10 border-rose-500/25',
            icon: Flame,
            sev: 'critical',
          },
          {
            label: 'Warnings',
            count: counts.warning,
            color: 'text-amber-400',
            bg: 'bg-amber-500/10 border-amber-500/25',
            icon: AlertTriangle,
            sev: 'warning',
          },
          {
            label: 'Informational',
            count: counts.info,
            color: 'text-blue-400',
            bg: 'bg-blue-500/10 border-blue-500/25',
            icon: Info,
            sev: 'info',
          },
        ].map((item) => (
          <button
            key={item.label}
            onClick={() =>
              setSeverityFilter((prev) => (prev === item.sev ? 'all' : (item.sev as SeverityFilter)))
            }
            className={clsx(
              'border rounded-xl p-4 text-left transition-all hover:scale-[1.01] flex items-center justify-between',
              item.bg,
              severityFilter === item.sev && 'ring-2 ring-white/30'
            )}
          >
            <div>
              <div className="text-xs text-slate-400 font-medium">{item.label}</div>
              <div className={clsx('text-2xl font-bold tracking-tight font-mono mt-0.5', item.color)}>
                {item.count}
              </div>
            </div>
            <item.icon className={clsx('w-6 h-6 opacity-80', item.color)} />
          </button>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex gap-1 bg-[#111827] border border-slate-800/80 rounded-xl p-1.5 self-start">
          {(['all', 'active', 'resolved'] as AlertFilter[]).map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={clsx(
                'px-3.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all',
                statusFilter === f
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              {f}
            </button>
          ))}
        </div>

        <div className="text-xs text-slate-400 font-mono">
          Showing {filtered.length} matching incident{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Incidents Feed */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl py-12">
            <EmptyState
              icon={CheckCircle2}
              title="No Incidents Found"
              description="All systems operating within acceptable parameters for the active filter."
            />
          </div>
        ) : (
          filtered.map((alert) => (
            <AlertCard
              key={alert.id}
              alert={alert}
              onAcknowledge={!alert.is_acknowledged && alert.status !== 'RESOLVED' ? acknowledgeAlert : undefined}
              onResolve={alert.status !== 'RESOLVED' ? resolveAlert : undefined}
            />
          ))
        )}
      </div>

      {/* Threshold Configuration Panel */}
      <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-6 shadow-lg shadow-black/20 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-5 h-5 text-blue-400" />
            <div>
              <h3 className="text-sm font-bold text-white">Dynamic Alert Threshold Rules</h3>
              <p className="text-xs text-slate-400">
                Tune trigger thresholds evaluated continuously by the NexaMonitor Alert Engine
              </p>
            </div>
          </div>
          <button
            onClick={handleSaveThresholds}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition-all shadow-sm disabled:opacity-50"
          >
            {saveSuccess ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                <span>Saved!</span>
              </>
            ) : (
              <>
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Rules'}</span>
              </>
            )}
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-2">
          {/* CPU Thresholds */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-xs font-bold text-white flex justify-between">
              <span>CPU Thresholds</span>
              <span className="text-blue-400 font-mono">Host & Containers</span>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-amber-400">Warning</span>
                <span className="text-slate-300 font-mono">{thresholds.cpuWarning}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                value={thresholds.cpuWarning}
                onChange={(e) =>
                  setThresholds({ ...thresholds, cpuWarning: Number(e.target.value) })
                }
                className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-rose-400">Critical</span>
                <span className="text-slate-300 font-mono">{thresholds.cpuCritical}%</span>
              </div>
              <input
                type="range"
                min="60"
                max="100"
                value={thresholds.cpuCritical}
                onChange={(e) =>
                  setThresholds({ ...thresholds, cpuCritical: Number(e.target.value) })
                }
                className="w-full accent-rose-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Memory Thresholds */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-xs font-bold text-white flex justify-between">
              <span>Memory Thresholds</span>
              <span className="text-purple-400 font-mono">RAM Cap Allocation</span>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-amber-400">Warning</span>
                <span className="text-slate-300 font-mono">{thresholds.memWarning}%</span>
              </div>
              <input
                type="range"
                min="50"
                max="95"
                value={thresholds.memWarning}
                onChange={(e) =>
                  setThresholds({ ...thresholds, memWarning: Number(e.target.value) })
                }
                className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-rose-400">Critical</span>
                <span className="text-slate-300 font-mono">{thresholds.memCritical}%</span>
              </div>
              <input
                type="range"
                min="60"
                max="100"
                value={thresholds.memCritical}
                onChange={(e) =>
                  setThresholds({ ...thresholds, memCritical: Number(e.target.value) })
                }
                className="w-full accent-rose-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>

          {/* Disk Thresholds */}
          <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="text-xs font-bold text-white flex justify-between">
              <span>Disk Thresholds</span>
              <span className="text-amber-400 font-mono">Root & Volumes</span>
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-amber-400">Warning</span>
                <span className="text-slate-300 font-mono">{thresholds.diskWarning}%</span>
              </div>
              <input
                type="range"
                min="60"
                max="95"
                value={thresholds.diskWarning}
                onChange={(e) =>
                  setThresholds({ ...thresholds, diskWarning: Number(e.target.value) })
                }
                className="w-full accent-amber-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
            <div>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-rose-400">Critical</span>
                <span className="text-slate-300 font-mono">{thresholds.diskCritical}%</span>
              </div>
              <input
                type="range"
                min="75"
                max="100"
                value={thresholds.diskCritical}
                onChange={(e) =>
                  setThresholds({ ...thresholds, diskCritical: Number(e.target.value) })
                }
                className="w-full accent-rose-400 h-1.5 bg-slate-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
