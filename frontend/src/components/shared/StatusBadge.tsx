import React from 'react';
import { clsx } from 'clsx';

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

const STATUS_CONFIG: Record<string, { label: string; className: string; dot: string }> = {
  running: {
    label: 'Running',
    className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
  stopped: {
    label: 'Stopped',
    className: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
    dot: 'bg-slate-400',
  },
  exited: {
    label: 'Exited',
    className: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
    dot: 'bg-rose-400',
  },
  paused: {
    label: 'Paused',
    className: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  restarting: {
    label: 'Restarting',
    className: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    dot: 'bg-blue-400 animate-pulse',
  },
  critical: {
    label: 'Critical',
    className: 'text-rose-400 bg-rose-500/10 border-rose-500/30',
    dot: 'bg-rose-400 animate-ping',
  },
  warning: {
    label: 'Warning',
    className: 'text-amber-400 bg-amber-500/10 border-amber-500/30',
    dot: 'bg-amber-400',
  },
  info: {
    label: 'Info',
    className: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
    dot: 'bg-blue-400',
  },
  healthy: {
    label: 'Healthy',
    className: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    dot: 'bg-emerald-400',
  },
};

export function StatusBadge({ status, size = 'md' }: StatusBadgeProps) {
  const config =
    STATUS_CONFIG[status.toLowerCase()] || {
      label: status,
      className: 'text-slate-400 bg-slate-500/10 border-slate-500/30',
      dot: 'bg-slate-400',
    };

  return (
    <span
      className={clsx(
        'inline-flex items-center gap-1.5 border rounded-full font-medium',
        config.className,
        size === 'sm' ? 'text-xs px-2 py-0.5' : 'text-xs px-2.5 py-1'
      )}
    >
      <span className={clsx('rounded-full flex-shrink-0', config.dot, size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2')} />
      {config.label}
    </span>
  );
}
