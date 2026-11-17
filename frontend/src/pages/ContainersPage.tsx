import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Play,
  Square,
  RotateCcw,
  Eye,
  ChevronUp,
  ChevronDown,
  Boxes,
  Plus,
  Server,
  Layers,
  Trash2,
  AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { SearchInput } from '@/components/shared/SearchInput';
import { DemoModeBanner, LiveModeBanner } from '@/components/shared/DemoModeBanner';
import { ProgressBar } from '@/components/shared/ProgressBar';
import { EmptyState } from '@/components/shared/EmptyState';
import { useApp } from '@/context/AppContext';
import { formatBytes } from '@/utils/format';
import { useDebounce } from '@/hooks/useDebounce';
import { clsx } from 'clsx';
import type { Container, ContainerStatus } from '@/types';

type SortKey = 'name' | 'status' | 'cpu_percent' | 'memory_percent';
type SortDir = 'asc' | 'desc';

const STATUS_FILTERS: { label: string; value: ContainerStatus }[] = [
  { label: 'All', value: 'all' },
  { label: 'Running', value: 'running' },
  { label: 'Stopped', value: 'stopped' },
  { label: 'Paused', value: 'paused' },
];

const PAGE_SIZE = 8;

export function ContainersPage() {
  const {
    containers,
    isDemoMode,
    startContainer,
    stopContainer,
    restartContainer,
    removeContainer,
  } = useApp();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<ContainerStatus>('all');
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [page, setPage] = useState(0);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [containerToDelete, setContainerToDelete] = useState<Container | null>(null);

  const debouncedSearch = useDebounce(search, 150);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
    setPage(0);
  };

  const filtered = useMemo(() => {
    let result = containers.filter((c) => {
      const matchSearch =
        !debouncedSearch ||
        c.name.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        c.image.toLowerCase().includes(debouncedSearch.toLowerCase()) ||
        c.id.toLowerCase().includes(debouncedSearch.toLowerCase());
      const matchStatus =
        statusFilter === 'all' ||
        c.status === statusFilter ||
        (statusFilter === 'stopped' && (c.status === 'stopped' || c.status === 'exited'));
      return matchSearch && matchStatus;
    });

    result = [...result].sort((a, b) => {
      let va: any = a[sortKey];
      let vb: any = b[sortKey];
      if (typeof va === 'string') {
        va = va.toLowerCase();
        vb = vb.toLowerCase();
      }
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
    });

    return result;
  }, [containers, debouncedSearch, statusFilter, sortKey, sortDir]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE) || 1;
  const paged = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

  const SortIcon = ({ k }: { k: SortKey }) => (
    <span className="ml-1.5 inline-flex flex-col text-slate-600 align-middle">
      <ChevronUp
        className={clsx('w-2.5 h-2.5 -mb-1', sortKey === k && sortDir === 'asc' && 'text-blue-400 font-bold')}
      />
      <ChevronDown
        className={clsx('w-2.5 h-2.5', sortKey === k && sortDir === 'desc' && 'text-blue-400 font-bold')}
      />
    </span>
  );

  const handleAction = async (
    e: React.MouseEvent,
    action: 'start' | 'stop' | 'restart',
    container: Container
  ) => {
    e.stopPropagation();
    setActionLoading(container.id);
    try {
      let res;
      if (action === 'start') {
        res = await startContainer(container.id);
      } else if (action === 'stop') {
        res = await stopContainer(container.id);
      } else if (action === 'restart') {
        res = await restartContainer(container.id);
      }
      setActionNotice(res?.message || `Successfully executed ${action} on ${container.name}`);
    } catch (err: any) {
      setActionNotice(`Failed to ${action} ${container.name}: ${err?.message || err}`);
    } finally {
      setActionLoading(null);
      setTimeout(() => setActionNotice(null), 5000);
    }
  };

  const confirmDelete = async () => {
    if (!containerToDelete) return;
    setActionLoading(containerToDelete.id);
    try {
      const res = await removeContainer(containerToDelete.id, true);
      setActionNotice(res?.message || `Successfully removed container ${containerToDelete.name}`);
    } catch (err: any) {
      setActionNotice(`Failed to remove ${containerToDelete.name}: ${err?.message || err}`);
    } finally {
      setContainerToDelete(null);
      setActionLoading(null);
      setTimeout(() => setActionNotice(null), 5000);
    }
  };

  const runningCount = containers.filter((c) => c.status === 'running').length;
  const stoppedCount = containers.filter((c) => c.status !== 'running').length;

  return (
    <div className="space-y-6">
      {isDemoMode ? <DemoModeBanner /> : <LiveModeBanner />}

      {actionNotice && (
        <div className="bg-blue-500/10 border border-blue-500/30 text-blue-300 text-xs px-4 py-2.5 rounded-lg flex items-center justify-between animate-slide-in">
          <span>{actionNotice}</span>
          <button onClick={() => setActionNotice(null)} className="text-blue-400 hover:text-white font-bold ml-4">
            ×
          </button>
        </div>
      )}

      <PageHeader
        title="Containers Management"
        subtitle="Inspect, configure and manage live container instances"
        badge={`${containers.length} Total`}
        actions={
          <div className="flex items-center gap-2">
            <div className="hidden sm:flex items-center gap-2 text-xs font-mono">
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/25 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {runningCount} Running
              </span>
              <span className="flex items-center gap-1.5 px-2.5 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/25 rounded-full">
                <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
                {stoppedCount} Inactive
              </span>
            </div>
          </div>
        }
      />

      {/* Control Bar: Search + Filters */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1 max-w-lg">
          <SearchInput
            value={search}
            onChange={(v) => {
              setSearch(v);
              setPage(0);
            }}
            placeholder="Search by name, image or ID..."
            className="flex-1"
          />
          <div className="flex gap-1 bg-[#111827] border border-slate-800/80 rounded-lg p-1">
            {STATUS_FILTERS.map((f) => (
              <button
                key={f.value}
                onClick={() => {
                  setStatusFilter(f.value);
                  setPage(0);
                }}
                className={clsx(
                  'px-3 py-1.5 rounded text-xs font-medium transition-all capitalize',
                  statusFilter === f.value
                    ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-400 self-center sm:self-auto font-mono">
          Showing {filtered.length} container{filtered.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Containers Table */}
      <div className="bg-[#111827]/90 border border-slate-800/80 rounded-xl overflow-hidden shadow-lg shadow-black/20">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-800/80 bg-slate-900/40">
                {[
                  { key: 'name' as SortKey, label: 'Container Name' },
                  { key: null, label: 'ID' },
                  { key: null, label: 'Image' },
                  { key: 'status' as SortKey, label: 'Status' },
                  { key: 'cpu_percent' as SortKey, label: 'CPU Usage' },
                  { key: 'memory_percent' as SortKey, label: 'Memory' },
                  { key: null, label: 'Network Speed' },
                  { key: null, label: 'Uptime' },
                  { key: null, label: 'Actions' },
                ].map((col) => (
                  <th
                    key={col.label}
                    onClick={col.key ? () => handleSort(col.key!) : undefined}
                    className={clsx(
                      'text-left py-3.5 px-4 text-xs font-semibold text-slate-400 uppercase tracking-wider whitespace-nowrap',
                      col.key && 'cursor-pointer hover:text-slate-200 select-none'
                    )}
                  >
                    {col.label}
                    {col.key && <SortIcon k={col.key} />}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {paged.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-12">
                    <EmptyState
                      icon={Boxes}
                      title="No containers found"
                      description="No container matched your active search query or status filter."
                    />
                  </td>
                </tr>
              ) : (
                paged.map((c) => (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/containers/${c.id}`)}
                    className="cursor-pointer hover:bg-slate-800/40 transition-colors group"
                  >
                    <td className="py-3.5 px-4">
                      <div className="text-white font-semibold group-hover:text-blue-400 transition-colors font-mono">
                        {c.name}
                      </div>
                      <div className="text-[11px] text-slate-400 sm:hidden">{c.image}</div>
                    </td>
                    <td className="py-3.5 px-4 font-mono text-xs text-slate-400">
                      {c.id.substring(0, 10)}
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-300 font-mono">
                      {c.image}
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={c.status} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 w-36">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={c.cpu_percent} size="sm" className="flex-1" />
                        <span className="text-xs text-slate-300 font-mono w-11 text-right">
                          {c.cpu_percent.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 w-40">
                      <div className="flex items-center gap-2">
                        <ProgressBar value={c.memory_percent} size="sm" color="purple" className="flex-1" />
                        <span className="text-xs text-slate-300 font-mono w-16 text-right">
                          {formatBytes(c.memory_usage)}
                        </span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs font-mono whitespace-nowrap">
                      <div className="text-cyan-400 flex items-center gap-1 text-[11px]">
                        <span>↓</span>
                        <span>{formatBytes(c.network_rx_bytes_per_sec || 0)}/s</span>
                      </div>
                      <div className="text-purple-400 flex items-center gap-1 text-[11px]">
                        <span>↑</span>
                        <span>{formatBytes(c.network_tx_bytes_per_sec || 0)}/s</span>
                      </div>
                    </td>
                    <td className="py-3.5 px-4 text-xs text-slate-400 font-mono whitespace-nowrap">
                      {c.uptime}
                    </td>
                    <td className="py-3.5 px-4" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center gap-1 opacity-80 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => navigate(`/containers/${c.id}`)}
                          title="View telemetry details"
                          className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-500/10 rounded-lg transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {c.status === 'running' ? (
                          <>
                            <button
                              disabled={actionLoading === c.id}
                              onClick={(e) => handleAction(e, 'stop', c)}
                              title="Stop container"
                              className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-40"
                            >
                              <Square className="w-4 h-4" />
                            </button>
                            <button
                              disabled={actionLoading === c.id}
                              onClick={(e) => handleAction(e, 'restart', c)}
                              title="Restart container"
                              className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors disabled:opacity-40"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          </>
                        ) : (
                          <button
                            disabled={actionLoading === c.id}
                            onClick={(e) => handleAction(e, 'start', c)}
                            title="Start container"
                            className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-500/10 rounded-lg transition-colors disabled:opacity-40"
                          >
                            <Play className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          disabled={actionLoading === c.id}
                          onClick={() => setContainerToDelete(c)}
                          title="Remove container"
                          className="p-1.5 text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 rounded-lg transition-colors disabled:opacity-40"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="border-t border-slate-800/80 px-4 py-3 flex items-center justify-between text-xs bg-slate-900/30">
            <span className="text-slate-400">
              Page {page + 1} of {totalPages}
            </span>
            <div className="flex gap-1.5">
              {Array.from({ length: totalPages }, (_, i) => (
                <button
                  key={i}
                  onClick={() => setPage(i)}
                  className={clsx(
                    'w-7 h-7 rounded-lg flex items-center justify-center font-medium transition-colors border',
                    page === i
                      ? 'bg-blue-600/20 text-blue-400 border-blue-500/40'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800 border-transparent'
                  )}
                >
                  {i + 1}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
      {/* Confirmation Modal for Container Removal */}
      {containerToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[#111827] border border-rose-500/30 rounded-xl max-w-md w-full p-6 shadow-2xl shadow-rose-950/40 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-rose-500/10 border border-rose-500/25 flex items-center justify-center text-rose-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-white font-semibold text-base">Remove Container</h3>
                <p className="text-slate-400 text-xs">This destructive action cannot be undone.</p>
              </div>
            </div>

            <div className="bg-slate-900/60 border border-slate-800 rounded-lg p-3 text-xs text-slate-300 space-y-1">
              <div>
                <span className="text-slate-500">Name:</span> <span className="font-mono text-white">{containerToDelete.name}</span>
              </div>
              <div>
                <span className="text-slate-500">ID:</span> <span className="font-mono text-slate-400">{containerToDelete.id}</span>
              </div>
              <div>
                <span className="text-slate-500">Image:</span> <span className="font-mono text-slate-400">{containerToDelete.image}</span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                disabled={actionLoading === containerToDelete.id}
                onClick={() => setContainerToDelete(null)}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-700/60 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={actionLoading === containerToDelete.id}
                onClick={confirmDelete}
                className="px-4 py-2 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors flex items-center gap-1.5"
              >
                {actionLoading === containerToDelete.id ? (
                  <span>Removing...</span>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Confirm Removal</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
