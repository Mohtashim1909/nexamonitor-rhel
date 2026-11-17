import React from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
      <div className="w-14 h-14 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center mb-1">
        <AlertTriangle className="w-7 h-7 text-rose-400" />
      </div>
      <div className="text-white font-semibold">{title}</div>
      {message && <div className="text-sm text-slate-400 max-w-xs">{message}</div>}
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm transition-colors border border-slate-700/60"
        >
          <RefreshCw className="w-4 h-4" /> Retry
        </button>
      )}
    </div>
  );
}
