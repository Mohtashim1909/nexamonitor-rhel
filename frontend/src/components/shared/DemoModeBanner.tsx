import React from 'react';
import { FlaskConical, AlertTriangle } from 'lucide-react';
import { useApp } from '@/context/AppContext';

export function DemoModeBanner() {
  const { setDemoMode } = useApp();
  return (
    <div className="flex items-center justify-between gap-3 bg-amber-500/10 border border-amber-500/25 rounded-lg px-4 py-2.5 mb-5 text-sm backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <FlaskConical className="w-4 h-4 text-amber-400 flex-shrink-0" />
        <span className="text-amber-300 font-semibold tracking-wide text-xs uppercase px-1.5 py-0.5 rounded bg-amber-400/20">
          Demo Mode
        </span>
        <span className="text-amber-200/80 text-xs sm:text-sm">
          Displaying simulated mock telemetry. Connect Docker to stream live container orchestration data.
        </span>
      </div>
      <button
        onClick={() => setDemoMode(false)}
        className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-400/20 text-amber-300 hover:bg-amber-400/30 transition-colors whitespace-nowrap"
      >
        Switch to Live Mode
      </button>
    </div>
  );
}

export function LiveModeBanner() {
  const {
    dockerStatus,
    dockerError,
    setDemoMode,
    wsStatus,
    monitoringInterval,
    lastMetricTime,
  } = useApp();

  if (dockerStatus?.connected) {
    const formattedLastTime = lastMetricTime
      ? new Date(lastMetricTime).toLocaleTimeString()
      : null;

    return (
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-4 py-2.5 mb-5 text-sm backdrop-blur-sm">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
          <span className="text-emerald-300 font-semibold tracking-wide text-xs uppercase px-1.5 py-0.5 rounded bg-emerald-400/20">
            Live Stream
          </span>
          <span className="text-emerald-200/90 text-xs sm:text-sm font-medium">
            Docker Engine v{dockerStatus.server_version || ''} ({dockerStatus.operating_system || 'Host'})
          </span>
          <span className="text-slate-500 text-xs hidden md:inline">•</span>
          <span className="text-emerald-400/80 text-xs font-mono hidden md:inline">
            Interval: {monitoringInterval / 1000}s
          </span>
          {formattedLastTime && (
            <>
              <span className="text-slate-500 text-xs hidden lg:inline">•</span>
              <span className="text-slate-400 text-xs font-mono hidden lg:inline">
                Synced at {formattedLastTime}
              </span>
            </>
          )}
        </div>
        <button
          onClick={() => setDemoMode(true)}
          className="text-xs font-semibold px-2.5 py-1 rounded bg-slate-800 text-slate-300 hover:bg-slate-700 transition-colors whitespace-nowrap self-start sm:self-auto"
        >
          View Demo Data
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-3 bg-rose-500/10 border border-rose-500/25 rounded-lg px-4 py-2.5 mb-5 text-sm backdrop-blur-sm">
      <div className="flex items-center gap-2.5">
        <AlertTriangle className="w-4 h-4 text-rose-400 flex-shrink-0" />
        <span className="text-rose-300 font-semibold tracking-wide text-xs uppercase px-1.5 py-0.5 rounded bg-rose-400/20">
          Docker Disconnected
        </span>
        <span className="text-rose-200/80 text-xs sm:text-sm">
          {dockerError || 'Cannot communicate with Docker Engine at unix:///var/run/docker.sock.'}
        </span>
      </div>
      <button
        onClick={() => setDemoMode(true)}
        className="text-xs font-semibold px-2.5 py-1 rounded bg-amber-400/20 text-amber-300 hover:bg-amber-400/30 transition-colors whitespace-nowrap"
      >
        Switch to Demo Mode
      </button>
    </div>
  );
}
