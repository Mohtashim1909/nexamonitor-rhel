import React from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
}

export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div className="w-14 h-14 rounded-2xl bg-slate-800/80 border border-slate-700/60 flex items-center justify-center mb-1">
        <Icon className="w-7 h-7 text-slate-500" />
      </div>
      <div className="text-white font-semibold text-base">{title}</div>
      {description && <div className="text-sm text-slate-400 max-w-sm">{description}</div>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
