import React, { useState, useEffect } from 'react';
import {
  Settings,
  Server,
  Bell,
  Clock,
  Shield,
  Save,
  CheckCircle2,
  RefreshCw,
  Sliders,
  Laptop,
  Radio,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DemoModeBanner } from '@/components/shared/DemoModeBanner';
import { useApp } from '@/context/AppContext';
import { api } from '@/services/api';

export function SettingsPage() {
  const { isDemoMode, setDemoMode, backendConnected, monitoringInterval, setMonitoringInterval, wsStatus } = useApp();
  const [dockerHost, setDockerHost] = useState('unix:///var/run/docker.sock');
  const [refreshInterval, setRefreshInterval] = useState(
    Math.round((monitoringInterval || 1000) / 1000).toString()
  );
  const [persistenceInterval, setPersistenceInterval] = useState('5');
  const [alertEmail, setAlertEmail] = useState('devops-admin@nexamonitor.internal');
  const [themeMode, setThemeMode] = useState('dark');
  const [retentionDays, setRetentionDays] = useState('30');
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (monitoringInterval) {
      setRefreshInterval(Math.round(monitoringInterval / 1000).toString());
    }
  }, [monitoringInterval]);

  useEffect(() => {
    if (!isDemoMode && backendConnected) {
      api.monitoring.getSettings().then((s) => {
        if (s.persistence_interval_ms) {
          setPersistenceInterval(Math.round(s.persistence_interval_ms / 1000).toString());
        }
        if (s.retention_days) {
          setRetentionDays(s.retention_days.toString());
        }
      }).catch(() => {});
    }
  }, [isDemoMode, backendConnected]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const intervalMs = Math.max(500, parseInt(refreshInterval, 10) * 1000);
      const persistMs = Math.max(1000, parseInt(persistenceInterval, 10) * 1000);
      const rDays = Math.max(1, parseInt(retentionDays, 10));

      await setMonitoringInterval(intervalMs);
      await api.monitoring.updateSettings({
        interval_ms: intervalMs,
        persistence_interval_ms: persistMs,
        retention_days: rDays,
      });

      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error('Failed to update monitoring preferences:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {isDemoMode && <DemoModeBanner />}

      {saveSuccess && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs px-4 py-2.5 rounded-lg flex items-center gap-2 animate-slide-in">
          <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          <span>Configuration preferences saved successfully.</span>
        </div>
      )}

      <PageHeader
        title="System Settings"
        subtitle="Daemon connection, polling intervals, alerting rules and global display preferences"
      />

      <form onSubmit={handleSave} className="space-y-6">
        {/* Docker Connection Configuration */}
        <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-6 shadow-lg shadow-black/20 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
            <Server className="w-4 h-4 text-blue-400" />
            <h3 className="text-sm font-bold text-white">Docker Daemon Connection</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Docker Socket / Daemon URI</label>
              <input
                type="text"
                value={dockerHost}
                onChange={(e) => setDockerHost(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2 text-slate-100 font-mono outline-none focus:border-blue-500/60"
              />
              <span className="text-[11px] text-slate-400">
                Default Unix socket (unix:///var/run/docker.sock) or TCP socket (tcp://127.0.0.1:2375)
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Operation Mode</label>
              <div className="flex items-center gap-3 pt-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    checked={isDemoMode}
                    onChange={() => setDemoMode(true)}
                    className="accent-blue-500"
                  />
                  <span className="text-slate-300">Simulated Demo Mode</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="mode"
                    checked={!isDemoMode}
                    onChange={() => setDemoMode(false)}
                    className="accent-blue-500"
                  />
                  <span className="text-slate-300">Live Docker Daemon Mode</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Polling & Telemetry Frequency */}
        <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-6 shadow-lg shadow-black/20 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold text-white">Real-Time Telemetry & Polling Preferences</h3>
            </div>
            {!isDemoMode && (
              <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 text-cyan-300 flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                Active Interval: {monitoringInterval}ms (WebSocket {wsStatus})
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Metrics Sampling Interval (WebSocket)</label>
              <select
                value={refreshInterval}
                onChange={(e) => setRefreshInterval(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2 text-slate-100 font-mono outline-none focus:border-blue-500/60 cursor-pointer"
              >
                <option value="1">1 second (1000 ms - High Fidelity)</option>
                <option value="2">2 seconds (2000 ms - Balanced)</option>
                <option value="5">5 seconds (5000 ms - Standard)</option>
                <option value="10">10 seconds (10000 ms - Low CPU)</option>
              </select>
              <span className="text-[11px] text-slate-400">
                Pushes non-blocking stats to connected clients.
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Historical Persistence Interval (SQLite)</label>
              <select
                value={persistenceInterval}
                onChange={(e) => setPersistenceInterval(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2 text-slate-100 font-mono outline-none focus:border-blue-500/60 cursor-pointer"
              >
                <option value="2">2 seconds (2000 ms - High Granularity)</option>
                <option value="5">5 seconds (5000 ms - Default Recommended)</option>
                <option value="10">10 seconds (10000 ms - Moderate Storage)</option>
                <option value="30">30 seconds (30000 ms - Minimal Disk Writes)</option>
              </select>
              <span className="text-[11px] text-slate-400">
                Frequency at which snapshots are saved into SQLite.
              </span>
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Database Retention Period</label>
              <select
                value={retentionDays}
                onChange={(e) => setRetentionDays(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2 text-slate-100 font-mono outline-none focus:border-blue-500/60 cursor-pointer"
              >
                <option value="7">7 Days (Lightweight storage)</option>
                <option value="30">30 Days (Standard telemetry)</option>
                <option value="90">90 Days (Enterprise long term)</option>
              </select>
              <span className="text-[11px] text-slate-400">
                Auto-purges records older than this horizon.
              </span>
            </div>
          </div>
        </div>

        {/* Notifications & Alert Dispatches */}
        <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl p-6 shadow-lg shadow-black/20 space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-800/80 pb-3">
            <Bell className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold text-white">Notification Webhooks & Email Alerts</h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Incident Alert Recipient</label>
              <input
                type="email"
                value={alertEmail}
                onChange={(e) => setAlertEmail(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700/80 rounded-lg px-3.5 py-2 text-slate-100 font-mono outline-none focus:border-blue-500/60"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-slate-300 font-medium">Auto-Acknowledge Resolved Incidents</label>
              <div className="pt-2 flex items-center gap-2">
                <input type="checkbox" id="autoAck" defaultChecked className="accent-blue-500 rounded" />
                <label htmlFor="autoAck" className="text-slate-300 cursor-pointer">
                  Mark alerts resolved once metrics drop beneath warning limits for &gt; 5 mins
                </label>
              </div>
            </div>
          </div>
        </div>

        {/* Save Bar */}
        <div className="flex justify-end gap-3 pt-2">
          <button
            type="submit"
            className="flex items-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition-all shadow-lg shadow-blue-500/20"
          >
            <Save className="w-4 h-4" />
            <span>Save Configuration</span>
          </button>
        </div>
      </form>
    </div>
  );
}
