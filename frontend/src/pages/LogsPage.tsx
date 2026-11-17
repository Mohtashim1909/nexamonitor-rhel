import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Terminal,
  Pause,
  Play,
  Download,
  Search,
  X,
  ChevronDown,
  RotateCcw,
  Maximize2,
  Trash2,
  RefreshCw,
} from 'lucide-react';
import { PageHeader } from '@/components/shared/PageHeader';
import { DemoModeBanner, LiveModeBanner } from '@/components/shared/DemoModeBanner';
import { useApp } from '@/context/AppContext';
import { api } from '@/services/api';
import { clsx } from 'clsx';

interface LogItem {
  ts: string;
  level: string;
  text: string;
}

const INITIAL_DEMO_LOGS: LogItem[] = [
  { ts: '2026-11-16T17:52:01.120Z', level: 'INFO', text: 'NexaMonitor agent connected to local Docker socket: unix:///var/run/docker.sock' },
  { ts: '2026-11-16T17:52:03.450Z', level: 'INFO', text: 'Database engine initialized with SQLite connection pool' },
  { ts: '2026-11-16T17:52:08.200Z', level: 'INFO', text: 'Telemetry daemon listening on ws://localhost:8000/ws/metrics' },
  { ts: '2026-11-16T17:52:15.890Z', level: 'INFO', text: 'Container discovered: nexamonitor-frontend (nginx:1.25-alpine) [running]' },
  { ts: '2026-11-16T17:52:21.030Z', level: 'INFO', text: 'Container discovered: nexamonitor-backend (python:3.11-slim) [running]' },
  { ts: '2026-11-16T17:52:25.400Z', level: 'INFO', text: 'Container discovered: postgres-db-primary (postgres:15-alpine) [running]' },
  { ts: '2026-11-16T17:52:34.120Z', level: 'WARN', text: 'High heap usage detected in backend worker pool: 78.3% threshold' },
  { ts: '2026-11-16T17:52:45.310Z', level: 'INFO', text: 'HTTP 200 GET /api/containers completed in 24.8ms' },
  { ts: '2026-11-16T17:52:51.640Z', level: 'ERROR', text: 'Socket read timeout on external registry: ping failed to ghcr.io' },
  { ts: '2026-11-16T17:52:55.200Z', level: 'INFO', text: 'Retry strategy executed (1/3). Re-establishing network socket' },
  { ts: '2026-11-16T17:53:01.780Z', level: 'INFO', text: 'HTTP 200 GET /api/system/snapshot completed in 12.1ms' },
  { ts: '2026-11-16T17:53:12.440Z', level: 'WARN', text: 'Slow I/O query detected: SELECT * FROM container_metrics took 185ms' },
  { ts: '2026-11-16T17:53:18.910Z', level: 'INFO', text: 'Cache miss for stats cache key: container_metrics_celery_worker' },
  { ts: '2026-11-16T17:53:22.150Z', level: 'INFO', text: 'Host process supervisor heartbeat OK. Uptime 16d 04h' },
  { ts: '2026-11-16T17:53:35.880Z', level: 'WARN', text: 'Container celery-async-worker CPU spike: 92.4% (Threshold: 90%)' },
  { ts: '2026-11-16T17:53:38.010Z', level: 'ERROR', text: 'Alert created [critical]: CPU usage exceeded 90% threshold on celery-async-worker' },
  { ts: '2026-11-16T17:53:40.550Z', level: 'INFO', text: 'Background garbage collection cycle cleaned 1,420 expired metric samples' },
  { ts: '2026-11-16T17:53:48.330Z', level: 'INFO', text: 'Broadcast metrics frame emitted to 1 active WebSocket client' },
  { ts: '2026-11-16T17:54:10.920Z', level: 'INFO', text: 'HTTP 200 GET /api/health completed in 1.4ms (status=healthy)' },
  { ts: '2026-11-16T17:54:25.100Z', level: 'INFO', text: '[DEMO MODE ACTIVE] Connect Docker daemon to stream real container stdout' },
];

type LogLevel = 'all' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';

export function LogsPage() {
  const [searchParams] = useSearchParams();
  const { containers, isDemoMode } = useApp();
  const urlContainerId = searchParams.get('container');

  const [selectedContainer, setSelectedContainer] = useState<string>(
    urlContainerId || (containers[0]?.id ?? 'all')
  );
  const [isPaused, setIsPaused] = useState(false);
  const [search, setSearch] = useState('');
  const [levelFilter, setLevelFilter] = useState<LogLevel>('all');
  const [logs, setLogs] = useState<LogItem[]>(INITIAL_DEMO_LOGS);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLiveStreaming, setIsLiveStreaming] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);

  const logsEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isPausedRef = useRef(isPaused);
  isPausedRef.current = isPaused;

  // Handle auto-scroll stickiness when user scrolls
  const handleContainerScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    const isNearBottom = scrollHeight - scrollTop - clientHeight < 60;
    setAutoScroll(isNearBottom);
  };

  // Parse raw log lines from Docker API into structured LogItem
  const parseDockerLogs = (lines: string[]): LogItem[] => {
    return lines.map((line) => {
      let ts = '';
      let text = line;
      let level = 'INFO';

      const spaceIdx = line.indexOf(' ');
      if (spaceIdx > 15 && (line.includes('T') || line.includes('Z'))) {
        ts = line.substring(0, spaceIdx);
        text = line.substring(spaceIdx + 1);
      } else {
        ts = new Date().toISOString();
      }

      const upper = text.toUpperCase();
      if (upper.includes('CRITICAL') || upper.includes('FATAL') || upper.includes('PANIC')) {
        level = 'CRITICAL';
      } else if (
        upper.includes('ERROR') ||
        upper.includes('FAIL') ||
        upper.includes('EXCEPTION') ||
        upper.includes('TRACEBACK')
      ) {
        level = 'ERROR';
      } else if (upper.includes('WARN') || upper.includes('WARNING')) {
        level = 'WARN';
      }

      return { ts, level, text };
    });
  };

  // Fetch initial or polling logs from REST API
  const fetchLiveLogs = useCallback(async () => {
    if (isDemoMode) return;
    const targetId = selectedContainer === 'all' ? (containers[0]?.id || '') : selectedContainer;
    if (!targetId) {
      setLogs([]);
      return;
    }

    try {
      setIsLoading(true);
      setErrorMsg(null);
      const res = await api.containers.logs(targetId, 250, true);
      const parsed = parseDockerLogs(res.lines || []);
      setLogs(parsed);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to fetch logs from Docker Engine');
    } finally {
      setIsLoading(false);
    }
  }, [isDemoMode, selectedContainer, containers]);

  // Connect to WebSocket stream for live logs
  useEffect(() => {
    if (isDemoMode) {
      setLogs(INITIAL_DEMO_LOGS);
      setIsLiveStreaming(false);
      return;
    }

    const targetId = selectedContainer === 'all' ? (containers[0]?.id || '') : selectedContainer;
    if (!targetId) {
      setLogs([]);
      return;
    }

    setIsLoading(true);
    setErrorMsg(null);

    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';
    const wsProto = baseUrl.startsWith('https') ? 'wss:' : 'ws:';
    const host = baseUrl.replace(/^https?:\/\//, '');
    const wsUrl = `${wsProto}//${host}/ws/containers/${targetId}/logs?tail=200&timestamps=true`;

    let ws: WebSocket | null = null;
    let isCleanedUp = false;

    try {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        if (!isCleanedUp) {
          setIsLiveStreaming(true);
          setIsLoading(false);
        }
      };

      ws.onmessage = (event) => {
        if (isCleanedUp || isPausedRef.current) return;
        try {
          const packet = JSON.parse(event.data);
          if (packet.type === 'init' && Array.isArray(packet.entries)) {
            const mapped: LogItem[] = packet.entries.map((e: any) => ({
              ts: e.timestamp,
              level: e.level,
              text: e.message,
            }));
            setLogs(mapped);
          } else if (packet.type === 'log_entry' && packet.data) {
            const item: LogItem = {
              ts: packet.data.timestamp,
              level: packet.data.level,
              text: packet.data.message,
            };
            setLogs((prev) => [...prev.slice(-1500), item]);
          } else if (packet.type === 'error') {
            setErrorMsg(packet.message);
          }
        } catch (e) {
          console.debug('Log WS parse error:', e);
        }
      };

      ws.onerror = () => {
        if (!isCleanedUp) {
          setIsLiveStreaming(false);
          // Fallback to REST fetch
          fetchLiveLogs();
        }
      };

      ws.onclose = () => {
        if (!isCleanedUp) {
          setIsLiveStreaming(false);
        }
      };
    } catch (err) {
      setIsLiveStreaming(false);
      fetchLiveLogs();
    }

    return () => {
      isCleanedUp = true;
      if (ws) {
        ws.close();
      }
    };
  }, [isDemoMode, selectedContainer, containers, fetchLiveLogs]);

  // Demo mode simulated log streaming
  useEffect(() => {
    if (!isDemoMode || isPaused) return;

    const interval = setInterval(() => {
      const msgs = [
        {
          level: 'INFO',
          text: `Sampled metrics telemetry frame for ${
            containers[Math.floor(Math.random() * containers.length)]?.name || 'cluster'
          }`,
        },
        { level: 'INFO', text: 'WebSocket heartbeat packet acknowledged by client' },
        { level: 'WARN', text: 'Container memory buffer approaching soft cap (72.1%)' },
      ];
      const randomMsg = msgs[Math.floor(Math.random() * msgs.length)];
      setLogs((prev) => [
        ...prev.slice(-150),
        { ts: new Date().toISOString(), level: randomMsg.level, text: randomMsg.text },
      ]);
    }, 5000);
    return () => clearInterval(interval);
  }, [isPaused, isDemoMode, containers]);

  // Sticky auto-scroll to bottom
  useEffect(() => {
    if (!isPaused && autoScroll) {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs, isPaused, autoScroll]);

  const filteredLogs = logs.filter((l) => {
    const matchLevel = levelFilter === 'all' || l.level === levelFilter;
    const matchSearch =
      !search ||
      l.text.toLowerCase().includes(search.toLowerCase()) ||
      l.level.toLowerCase().includes(search.toLowerCase());
    return matchLevel && matchSearch;
  });

  const getLevelColor = (level: string) => {
    switch (level) {
      case 'CRITICAL':
        return 'text-rose-400 bg-rose-500/20 border-rose-500/40';
      case 'ERROR':
        return 'text-rose-400 bg-rose-400/10 border-rose-400/20';
      case 'WARN':
        return 'text-amber-400 bg-amber-400/10 border-amber-400/20';
      default:
        return 'text-cyan-400 bg-cyan-400/10 border-cyan-400/20';
    }
  };

  const handleDownloadLogs = () => {
    if (!isDemoMode && selectedContainer && selectedContainer !== 'all') {
      const url = api.containers.downloadLogsUrl(
        selectedContainer,
        2000,
        true,
        search,
        levelFilter
      );
      window.open(url, '_blank');
      return;
    }

    const content = filteredLogs
      .map((l) => `${l.ts} [${l.level.padEnd(8)}] ${l.text}`)
      .join('\n');
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `nexamonitor-${selectedContainer}-logs.log`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleClearTerminal = () => {
    setLogs([]);
  };

  const selectedContainerName =
    containers.find((c) => c.id === selectedContainer)?.name ||
    (selectedContainer === 'all' ? 'All Containers' : selectedContainer);

  return (
    <div className="space-y-6">
      {isDemoMode ? <DemoModeBanner /> : <LiveModeBanner />}

      <PageHeader
        title="Live Container Logs"
        subtitle="Terminal-inspired streaming log console with real-time level filtering and search"
        badge={selectedContainerName}
        actions={
          <div className="flex items-center gap-2">
            {!isDemoMode && (
              <button
                onClick={fetchLiveLogs}
                title="Refresh logs from Docker"
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs transition-colors border border-slate-700/60"
              >
                <RefreshCw className={clsx('w-3.5 h-3.5', isLoading && 'animate-spin text-blue-400')} />
              </button>
            )}
            <button
              onClick={() => setIsPaused((p) => !p)}
              className={clsx(
                'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all',
                isPaused
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/20'
                  : 'bg-slate-800 text-slate-300 border-slate-700/60 hover:bg-slate-700'
              )}
            >
              {isPaused ? (
                <>
                  <Play className="w-3.5 h-3.5" />
                  <span>Resume Stream</span>
                </>
              ) : (
                <>
                  <Pause className="w-3.5 h-3.5" />
                  <span>Pause Stream</span>
                </>
              )}
            </button>
            <button
              onClick={handleClearTerminal}
              title="Clear terminal buffer"
              className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs transition-colors border border-slate-700/60"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleDownloadLogs}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-semibold transition-colors border border-slate-700/60"
            >
              <Download className="w-3.5 h-3.5 text-blue-400" />
              <span>Export</span>
            </button>
          </div>
        }
      />

      {/* Filter and Container Selection Controls */}
      <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
        <div className="flex flex-col sm:flex-row gap-3 flex-1 max-w-2xl">
          {/* Container Selector */}
          <div className="relative min-w-[220px]">
            <select
              value={selectedContainer}
              onChange={(e) => setSelectedContainer(e.target.value)}
              className="w-full appearance-none bg-[#111827] border border-slate-700/60 rounded-xl px-4 py-2 pr-9 text-xs font-mono text-slate-200 outline-none focus:border-blue-500/60 cursor-pointer shadow-inner"
            >
              <option value="all">All / Default Container</option>
              {containers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id.substring(0, 8)}) — {c.status}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          </div>

          {/* Search Logs */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search log output regex or text..."
              className="w-full bg-[#111827] border border-slate-700/60 rounded-xl pl-9 pr-8 py-2 text-xs font-mono text-slate-200 placeholder-slate-500 outline-none focus:border-blue-500/60"
            />
            {search && (
              <button
                onClick={() => setSearch('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Severity Filter Pills */}
        <div className="flex gap-1 bg-[#111827] border border-slate-800/80 rounded-xl p-1 self-start sm:self-auto">
          {(['all', 'INFO', 'WARN', 'ERROR', 'CRITICAL'] as LogLevel[]).map((level) => (
            <button
              key={level}
              onClick={() => setLevelFilter(level)}
              className={clsx(
                'px-3 py-1 rounded-lg text-xs font-mono font-medium transition-all uppercase',
                levelFilter === level
                  ? 'bg-blue-600/20 text-blue-400 border border-blue-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              )}
            >
              {level}
            </button>
          ))}
        </div>
      </div>

      {/* Terminal Display */}
      <div className="relative bg-[#060a14] border border-slate-800/80 rounded-xl overflow-hidden shadow-2xl flex flex-col font-mono text-xs">
        {/* Terminal Header */}
        <div className="px-4 py-2.5 bg-[#0d1225] border-b border-slate-800/80 flex items-center justify-between select-none">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-rose-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500/80 inline-block" />
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500/80 inline-block" />
            </div>
            <div className="flex items-center gap-2 pl-3 border-l border-slate-800">
              <Terminal className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-slate-300 font-semibold">{selectedContainerName}</span>
              <span className="text-slate-600 text-[10px]">•</span>
              <span className="text-slate-500 text-[11px]">
                {filteredLogs.length} events buffered
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {!isPaused && isLiveStreaming && (
              <span className="flex items-center gap-1.5 text-emerald-400 text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Live WebSocket Stream
              </span>
            )}
            {!isPaused && !isLiveStreaming && (
              <span className="flex items-center gap-1.5 text-blue-400 text-[11px] font-semibold">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-400" />
                Polling Stream
              </span>
            )}
            {isPaused && (
              <span className="text-amber-400 text-[11px] font-semibold">[PAUSED]</span>
            )}
          </div>
        </div>

        {/* Log Stream Body */}
        <div
          ref={scrollContainerRef}
          onScroll={handleContainerScroll}
          className="p-4 overflow-y-auto max-h-[560px] min-h-[380px] space-y-1 selection:bg-blue-500/30 selection:text-white"
        >
          {errorMsg ? (
            <div className="py-12 text-center text-rose-400 font-mono text-xs space-y-2">
              <div>[Docker Error]: {errorMsg}</div>
              <div className="text-slate-500">Verify container is running or check Docker connection status.</div>
            </div>
          ) : filteredLogs.length === 0 ? (
            <div className="py-12 text-center text-slate-500 font-mono text-xs">
              {isLoading ? 'Querying container stdout...' : 'No log lines matched the active filter or query.'}
            </div>
          ) : (
            filteredLogs.map((log, i) => (
              <div
                key={i}
                className="flex items-start gap-3 py-0.5 hover:bg-slate-800/30 px-1.5 rounded transition-colors group leading-relaxed"
              >
                <span className="text-slate-600 select-none text-[10px] w-8 text-right flex-shrink-0 group-hover:text-slate-500">
                  {i + 1}
                </span>
                <span className="text-slate-500 flex-shrink-0 text-[11px] whitespace-nowrap">
                  {log.ts.substring(0, 19).replace('T', ' ')}
                </span>
                <span
                  className={clsx(
                    'px-1.5 py-0.2 rounded text-[10px] font-bold border flex-shrink-0 uppercase',
                    getLevelColor(log.level)
                  )}
                >
                  {log.level}
                </span>
                <span
                  className={clsx(
                    'text-slate-300 break-all flex-1',
                    log.level === 'CRITICAL' && 'text-rose-400 font-bold',
                    log.level === 'ERROR' && 'text-rose-300 font-medium',
                    log.level === 'WARN' && 'text-amber-300'
                  )}
                >
                  {log.text}
                </span>
              </div>
            ))
          )}
          <div ref={logsEndRef} />
        </div>

        {/* Floating Scroll to Latest Button */}
        {!autoScroll && (
          <button
            onClick={() => {
              setAutoScroll(true);
              logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
            className="absolute bottom-4 right-6 px-3 py-1.5 bg-blue-600/90 hover:bg-blue-500 text-white text-xs font-semibold rounded-full shadow-lg transition-all flex items-center gap-1.5 backdrop-blur-sm border border-blue-400/30"
          >
            <ChevronDown className="w-3.5 h-3.5" />
            <span>Scroll to latest</span>
          </button>
        )}
      </div>
    </div>
  );
}
