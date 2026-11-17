import React from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Boxes,
  LineChart,
  Bell,
  Terminal,
  Activity,
  GitCompare,
  Layers,
  FileText,
  Settings,
  ChevronLeft,
  ChevronRight,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useApp } from '@/context/AppContext';
import { clsx } from 'clsx';

const NAV_ITEMS = [
  { label: 'Overview', icon: LayoutDashboard, path: '/' },
  { label: 'Containers', icon: Boxes, path: '/containers' },
  { label: 'Analytics', icon: LineChart, path: '/analytics' },
  { label: 'Alerts', icon: Bell, path: '/alerts' },
  { label: 'Logs', icon: Terminal, path: '/logs' },
  { label: 'System Health', icon: Activity, path: '/system' },
  { label: 'Comparisons', icon: GitCompare, path: '/comparisons' },
  { label: 'Docker Images', icon: Layers, path: '/images' },
  { label: 'Reports', icon: FileText, path: '/reports' },
  { label: 'Settings', icon: Settings, path: '/settings' },
];

interface SidebarProps {
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

export function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
  const { sidebarCollapsed, toggleSidebar, alerts } = useApp();
  const location = useLocation();

  const unacknowledgedAlerts = alerts.filter((a) => !a.is_acknowledged).length;

  const sidebarContent = (
    <div
      className={clsx(
        'flex flex-col h-full bg-[#0d1225] border-r border-slate-800/80 transition-all duration-300 relative select-none',
        sidebarCollapsed ? 'w-20' : 'w-64'
      )}
    >
      {/* Brand Header */}
      <div
        className={clsx(
          'flex items-center gap-3 px-4 py-5 border-b border-slate-800/80',
          sidebarCollapsed && 'justify-center px-0'
        )}
      >
        <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-tr from-blue-600 to-cyan-400 flex items-center justify-center shadow-lg shadow-blue-500/25 ring-1 ring-white/20">
          <ShieldCheck className="w-5 h-5 text-white" />
        </div>
        {!sidebarCollapsed && (
          <div className="overflow-hidden">
            <div className="text-white font-bold text-base tracking-tight flex items-center gap-1.5">
              <span>NexaMonitor</span>
              <span className="text-[10px] font-mono uppercase bg-blue-500/20 text-blue-400 border border-blue-500/30 px-1.5 py-0.2 rounded font-semibold">
                v1.0
              </span>
            </div>
            <div className="text-slate-400 text-xs truncate">Monitor. Analyze. Optimize.</div>
          </div>
        )}
        {!sidebarCollapsed && onMobileClose && (
          <button
            onClick={onMobileClose}
            className="ml-auto text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 lg:hidden"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Navigation List */}
      <nav className="flex-1 py-4 overflow-y-auto overflow-x-hidden space-y-6 px-3">
        <div>
          {!sidebarCollapsed && (
            <div className="px-3 mb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
              Platform
            </div>
          )}
          <ul className="space-y-1">
            {NAV_ITEMS.map(({ label, icon: Icon, path }) => {
              const isActive =
                path === '/'
                  ? location.pathname === '/'
                  : location.pathname.startsWith(path);
              return (
                <li key={path}>
                  <NavLink
                    to={path}
                    onClick={onMobileClose}
                    title={sidebarCollapsed ? label : undefined}
                    className={clsx(
                      'flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all group relative',
                      isActive
                        ? 'bg-blue-600/15 text-blue-400 border border-blue-500/30 shadow-sm'
                        : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200',
                      sidebarCollapsed && 'justify-center px-0'
                    )}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-5 bg-blue-400 rounded-r-full" />
                    )}
                    <Icon
                      className={clsx(
                        'flex-shrink-0 w-4 h-4 transition-colors',
                        isActive
                          ? 'text-blue-400'
                          : 'text-slate-400 group-hover:text-slate-200'
                      )}
                    />
                    {!sidebarCollapsed && <span className="truncate">{label}</span>}
                    {label === 'Alerts' && unacknowledgedAlerts > 0 && (
                      <span
                        className={clsx(
                          'ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/30',
                          sidebarCollapsed && 'absolute top-1 right-2'
                        )}
                      >
                        {unacknowledgedAlerts}
                      </span>
                    )}
                  </NavLink>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      {/* Collapse Toggle Footer */}
      <div className="p-3 border-t border-slate-800/80 bg-[#0a0e1a]/40">
        <button
          onClick={toggleSidebar}
          className="hidden lg:flex w-full items-center justify-center gap-2 px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 text-xs font-medium transition-all border border-transparent hover:border-slate-700/60"
        >
          {sidebarCollapsed ? (
            <ChevronRight className="w-4 h-4" />
          ) : (
            <>
              <ChevronLeft className="w-4 h-4" />
              <span>Collapse Sidebar</span>
            </>
          )}
        </button>
      </div>
    </div>
  );

  return (
    <>
      <aside className="hidden lg:flex flex-shrink-0 z-20">{sidebarContent}</aside>
      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50 flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
            onClick={onMobileClose}
          />
          <div className="relative flex-shrink-0 z-10">{sidebarContent}</div>
        </div>
      )}
    </>
  );
}
