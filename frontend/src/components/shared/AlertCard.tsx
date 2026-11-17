import React from 'react';
import { AlertTriangle, Info, Check, CheckCircle2 } from 'lucide-react';
import type { Alert } from '@/types';
import { formatTimeAgo } from '@/utils/format';
import { clsx } from 'clsx';

interface AlertCardProps {
  alert: Alert;
  onAcknowledge?: (id: number) => void;
  onResolve?: (id: number) => void;
  compact?: boolean;
}

const SEVERITY_CONFIG = {
  critical: {
    icon: AlertTriangle,
    color: 'text-rose-400',
    bg: 'bg-rose-500/10 border-rose-500/30',
  },
  warning: {
    icon: AlertTriangle,
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/30',
  },
  info: {
    icon: Info,
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/30',
  },
};

export function AlertCard({ alert, onAcknowledge, onResolve, compact = false }: AlertCardProps) {
  const config = SEVERITY_CONFIG[alert.severity] || SEVERITY_CONFIG.info;
  const Icon = config.icon;
  const isResolved = alert.status === 'RESOLVED';
  const isAcknowledged = alert.is_acknowledged || alert.status === 'ACKNOWLEDGED';

  return (
    <div
      className={clsx(
        'border rounded-xl flex items-start gap-3 transition-all',
        config.bg,
        isResolved && 'opacity-40 grayscale',
        isAcknowledged && !isResolved && 'opacity-70',
        compact ? 'p-3' : 'p-4'
      )}
    >
      <Icon className={clsx('flex-shrink-0 mt-0.5', config.color, compact ? 'w-4 h-4' : 'w-5 h-5')} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap mb-0.5">
          {alert.container_name && (
            <span className="text-xs font-semibold text-slate-300 font-mono">
              {alert.container_name}
            </span>
          )}
          {alert.alert_type && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 font-mono">
              {alert.alert_type}
            </span>
          )}
          {alert.occurrence_count && alert.occurrence_count > 1 && (
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-semibold font-mono">
              ×{alert.occurrence_count} occurrences
            </span>
          )}
        </div>

        <div className={clsx('text-slate-100 font-medium', compact ? 'text-xs' : 'text-sm')}>
          {alert.message}
        </div>

        <div className="text-[11px] text-slate-500 mt-1.5 flex items-center gap-2 flex-wrap">
          <span>Triggered {formatTimeAgo(alert.triggered_at || alert.created_at)}</span>
          {isAcknowledged && !isResolved && (
            <span className="text-emerald-400 font-semibold flex items-center gap-1">
              • Acknowledged
            </span>
          )}
          {isResolved && (
            <span className="text-slate-400 font-semibold flex items-center gap-1">
              • Resolved {alert.resolved_at ? formatTimeAgo(alert.resolved_at) : ''}
            </span>
          )}
          {alert.observed_value !== undefined && alert.observed_value !== null && alert.threshold_value !== undefined && alert.threshold_value !== null && (
            <span className="text-slate-400 font-mono">
              (Value: {alert.observed_value} / Threshold: {alert.threshold_value})
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-shrink-0">
        {!isAcknowledged && !isResolved && onAcknowledge && (
          <button
            onClick={() => onAcknowledge(alert.id)}
            title="Acknowledge alert"
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors border border-slate-700/60"
          >
            <Check className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">Ack</span>
          </button>
        )}
        {!isResolved && onResolve && (
          <button
            onClick={() => onResolve(alert.id)}
            title="Mark as resolved"
            className="flex items-center gap-1 px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors border border-slate-700/60"
          >
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-400" />
            <span className="hidden sm:inline">Resolve</span>
          </button>
        )}
      </div>
    </div>
  );
}
