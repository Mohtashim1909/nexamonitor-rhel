import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  Menu,
  Search,
  Bell,
  User,
  ChevronRight,
  Wifi,
  WifiOff,
  RefreshCw,
  Terminal,
  FlaskConical,
  Radio,
  Server,
  Activity,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { clsx } from 'clsx';

const PAGE_TITLES: Record<string, { title: string; breadcrumbs: string[] }> = {
  '/': { title: 'Overview', breadcrumbs: ['NexaMonitor', 'Overview'] },
  '/containers': { title: 'Containers', breadcrumbs: ['NexaMonitor', 'Containers'] },
  '/analytics': { title: 'Analytics', breadcrumbs: ['NexaMonitor', 'Analytics'] },
  '/alerts': { title: 'Alerts', breadcrumbs: ['NexaMonitor', 'Alerts'] },
  '/logs': { title: 'Logs', breadcrumbs: ['NexaMonitor', 'Logs'] },
  '/system': { title: 'System Health', breadcrumbs: ['NexaMonitor', 'System Health'] },
  '/comparisons': { title: 'Comparisons', breadcrumbs: ['NexaMonitor', 'Comparisons'] },
  '/images': { title: 'Docker Images', breadcrumbs: ['NexaMonitor', 'Docker Images'] },
  '/reports': { title: 'Reports', breadcrumbs: ['NexaMonitor', 'Reports'] },
  '/settings': { title: 'Settings', breadcrumbs: ['NexaMonitor', 'Settings'] },
};

interface TopBarProps {
  onMenuClick: () => void;
}

export function TopBar({ onMenuClick }: TopBarProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const {
    alerts,
    backendConnected,
    dockerStatus,
    dockerError,
    isDemoMode,
    toggleDemoMode,
    refreshData,
    wsStatus,
  } = useApp();
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchValue, setSearchValue] = useState('');
  const [isRefreshing, setIsRefreshing] = useState(false);

  const pageKey =
    Object.keys(PAGE_TITLES).find(
      (k) => k !== '/' && location.pathname.startsWith(k)
    ) || (location.pathname === '/' ? '/' : '/');
  const pageInfo = PAGE_TITLES[pageKey] || { title: 'Dashboard', breadcrumbs: ['NexaMonitor', 'Dashboard'] };
  const unacknowledgedCount = alerts.filter((a) => !a.is_acknowledged).length;

  const handleManualRefresh = async () => {
    setIsRefreshing(true);
    await refreshData();
    setTimeout(() => setIsRefreshing(false), 600);
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchValue.trim()) {
      navigate(`/containers?q=${encodeURIComponent(searchValue.trim())}`);
    }
  };

  return (
    <header className="h-16 bg-[#0d1225]/90 backdrop-blur-md border-b border-slate-800/80 flex items-center gap-4 px-4 lg:px-6 sticky top-0 z-30 justify-between select-none">
      <div className="flex items-center gap-3">
        <button
          onClick={onMenuClick}
          className="lg:hidden text-slate-400 hover:text-white p-2 rounded-lg hover:bg-slate-800 transition-colors"
          aria-label="Toggle Navigation"
        >
          <Menu className="w-5 h-5" />
        </button>

        {/* Dynamic Breadcrumbs */}
        <div className="hidden sm:flex items-center gap-2 text-xs">
          {pageInfo.breadcrumbs.map((crumb, i) => (
            <React.Fragment key={crumb}>
              {i > 0 && <ChevronRight className="w-3.5 h-3.5 text-slate-600 flex-shrink-0" />}
              <span
                className={clsx(
                  i === pageInfo.breadcrumbs.length - 1
                    ? 'text-white font-semibold'
                    : 'text-slate-400 font-medium'
                )}
              >
                {crumb}
              </span>
            </React.Fragment>
          ))}
        </div>

        <div className="sm:hidden text-white font-semibold text-sm truncate">
          {pageInfo.title}
        </div>
      </div>

      {/* Right Controls */}
      <div className="flex items-center gap-3">
        {/* Quick Search Bar */}
        <form onSubmit={handleSearchSubmit} className="relative hidden md:block">
          <div
            className={clsx(
              'flex items-center gap-2 bg-slate-900/80 border rounded-lg px-3 py-1.5 transition-all shadow-inner',
              searchFocused
                ? 'border-blue-500/60 ring-2 ring-blue-500/15 w-64'
                : 'border-slate-700/60 w-48'
            )}
          >
            <Search className="w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              className="bg-transparent text-slate-200 placeholder-slate-500 outline-none w-full text-xs"
              placeholder="Search containers..."
              value={searchValue}
              onChange={(e) => setSearchValue(e.target.value)}
              onFocus={() => setSearchFocused(true)}
              onBlur={() => setSearchFocused(false)}
            />
          </div>
        </form>

        {/* Refresh button */}
        <button
          onClick={handleManualRefresh}
          title="Refresh metrics status"
          className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors"
        >
          <RefreshCw className={clsx('w-4 h-4', isRefreshing && 'animate-spin text-blue-400')} />
        </button>

        {/* Mode Selector Toggle */}
        <button
          onClick={toggleDemoMode}
          title={isDemoMode ? "Currently in Demo Mode. Click to switch to Live Docker." : "Currently in Live Mode. Click to switch to Demo Mode."}
          className={clsx(
            'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border transition-all cursor-pointer shadow-sm',
            isDemoMode
              ? 'text-amber-400 bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/20'
              : 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30 hover:bg-cyan-500/20'
          )}
        >
          {isDemoMode ? (
            <>
              <FlaskConical className="w-3.5 h-3.5 text-amber-400" />
              <span>DEMO MODE</span>
            </>
          ) : (
            <>
              <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span>LIVE MODE</span>
            </>
          )}
        </button>

        {/* Docker Engine Connection Status Pill */}
        <div
          title={
            dockerStatus?.connected
              ? `Docker Engine v${dockerStatus.server_version || ''} (${dockerStatus.operating_system || ''})`
              : (dockerError || 'Docker daemon disconnected')
          }
          className={clsx(
            'hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium border backdrop-blur-sm',
            dockerStatus?.connected
              ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30'
              : 'text-rose-400 bg-rose-500/10 border-rose-500/30'
          )}
        >
          <span
            className={clsx(
              'w-2 h-2 rounded-full',
              dockerStatus?.connected ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
            )}
          />
          <span>{dockerStatus?.connected ? 'Docker Connected' : 'Docker Offline'}</span>
        </div>

        {/* Real-time WebSocket Stream Status Pill (in LIVE Mode) */}
        {!isDemoMode && (
          <div
            title={`WebSocket telemetry stream state: ${wsStatus}`}
            className={clsx(
              'hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-mono font-medium border backdrop-blur-sm',
              wsStatus === 'CONNECTED'
                ? 'text-cyan-400 bg-cyan-500/10 border-cyan-500/30'
                : wsStatus === 'RECONNECTING' || wsStatus === 'CONNECTING'
                ? 'text-amber-400 bg-amber-500/10 border-amber-500/30'
                : 'text-slate-400 bg-slate-800/40 border-slate-700/40'
            )}
          >
            <span
              className={clsx(
                'w-1.5 h-1.5 rounded-full',
                wsStatus === 'CONNECTED'
                  ? 'bg-cyan-400 animate-pulse'
                  : wsStatus === 'RECONNECTING' || wsStatus === 'CONNECTING'
                  ? 'bg-amber-400 animate-ping'
                  : 'bg-slate-500'
              )}
            />
            <span>{wsStatus}</span>
          </div>
        )}

        {/* Notifications Icon with Badge */}
        <button
          onClick={() => navigate('/alerts')}
          className="relative p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800/80 transition-colors"
          title="View Alerts"
        >
          <Bell className="w-4 h-4" />
          {unacknowledgedCount > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[9px] font-bold rounded-full flex items-center justify-center animate-pulse">
              {unacknowledgedCount > 9 ? '9+' : unacknowledgedCount}
            </span>
          )}
        </button>

        {/* User avatar indicator */}
        <div className="flex items-center gap-2 pl-2 border-l border-slate-800/80">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center border border-white/10 shadow-sm cursor-pointer hover:ring-2 hover:ring-blue-400/40 transition-all">
            <User className="w-4 h-4 text-white" />
          </div>
        </div>
      </div>
    </header>
  );
}
