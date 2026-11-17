import React from 'react';
import { clsx } from 'clsx';
import type { LucideIcon } from 'lucide-react';

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon: LucideIcon;
  iconColor?: string;
  iconBg?: string;
  trend?: { value: number; label: string };
  className?: string;
  children?: React.ReactNode;
}

export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  iconColor = 'text-blue-400',
  iconBg = 'bg-blue-500/10 border-blue-500/20',
  trend,
  className,
  children,
}: MetricCardProps) {
  return (
    <div
      className={clsx(
        'bg-[#111827]/90 border border-slate-800/80 rounded-xl p-5 hover:border-slate-700/80 transition-all duration-200 group shadow-lg shadow-black/20',
        className
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={clsx('w-10 h-10 rounded-lg border flex items-center justify-center', iconBg)}>
          <Icon className={clsx('w-5 h-5', iconColor)} />
        </div>
        {trend && (
          <div
            className={clsx(
              'text-xs font-medium px-2 py-0.5 rounded-full border',
              trend.value >= 0
                ? 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20'
                : 'text-rose-400 bg-rose-500/10 border-rose-500/20'
            )}
          >
            {trend.value >= 0 ? '+' : ''}
            {trend.value}% {trend.label}
          </div>
        )}
      </div>
      <div className="text-2xl font-bold text-white tracking-tight mb-0.5">{value}</div>
      <div className="text-xs text-slate-400 font-medium">{title}</div>
      {subtitle && <div className="text-xs text-slate-500 mt-1 font-mono">{subtitle}</div>}
      {children}
    </div>
  );
}
