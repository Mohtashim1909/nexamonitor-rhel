import React from 'react';
import { clsx } from 'clsx';

interface ProgressBarProps {
  value: number;
  max?: number;
  size?: 'sm' | 'md';
  color?: 'blue' | 'cyan' | 'purple' | 'green' | 'red' | 'yellow';
  showLabel?: boolean;
  className?: string;
}

const colorMap = {
  blue: 'bg-blue-500',
  cyan: 'bg-cyan-500',
  purple: 'bg-purple-500',
  green: 'bg-emerald-500',
  red: 'bg-rose-500',
  yellow: 'bg-amber-500',
};

function getAutoColor(value: number): 'green' | 'yellow' | 'red' {
  if (value < 60) return 'green';
  if (value < 85) return 'yellow';
  return 'red';
}

export function ProgressBar({
  value,
  max = 100,
  size = 'md',
  color,
  showLabel = false,
  className,
}: ProgressBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const c = color || getAutoColor(pct);

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      <div className={clsx('flex-1 bg-slate-800 rounded-full overflow-hidden border border-slate-700/40', size === 'sm' ? 'h-1.5' : 'h-2')}>
        <div
          className={clsx('h-full rounded-full transition-all duration-500', colorMap[c])}
          style={{ width: `${pct}%` }}
        />
      </div>
      {showLabel && (
        <span className="text-xs text-slate-400 w-10 text-right font-mono font-medium">
          {pct.toFixed(0)}%
        </span>
      )}
    </div>
  );
}
