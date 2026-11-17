/**
 * DEMO DATA - Phase 1 UI development only.
 * Clearly identified as sample data; do not confuse with live Docker metrics.
 */
import type { Container, Alert, DockerImage, ChartDataPoint, SystemMetrics } from '@/types';

const now = new Date();

function timeAgo(minutes: number): string {
  return new Date(now.getTime() - minutes * 60 * 1000).toISOString();
}

export const DEMO_CONTAINERS: Container[] = [
  { id: 'a1b2c3d4e5f6', name: 'nexamonitor-frontend', image: 'nginx:1.25-alpine', status: 'running', cpu_percent: 2.4, memory_usage: 52428800, memory_limit: 268435456, memory_percent: 19.5, network_rx: 1245678, network_tx: 892345, uptime: '5d 14h 23m', created: timeAgo(8000), ports: ['80:80', '443:443'], labels: { env: 'production', role: 'frontend' } },
  { id: 'b2c3d4e5f6a7', name: 'nexamonitor-backend', image: 'python:3.11-slim', status: 'running', cpu_percent: 24.7, memory_usage: 134217728, memory_limit: 536870912, memory_percent: 25.0, network_rx: 5678901, network_tx: 3456789, uptime: '2d 8h 15m', created: timeAgo(3400), ports: ['8000:8000'], labels: { env: 'production', tier: 'api' } },
  { id: 'c3d4e5f6a7b8', name: 'postgres-db-primary', image: 'postgres:15-alpine', status: 'running', cpu_percent: 8.1, memory_usage: 268435456, memory_limit: 1073741824, memory_percent: 25.0, network_rx: 234567, network_tx: 345678, uptime: '10d 2h 45m', created: timeAgo(14500), ports: ['5432:5432'], labels: { env: 'production', tier: 'database' } },
  { id: 'd4e5f6a7b8c9', name: 'redis-state-cache', image: 'redis:7.2-alpine', status: 'running', cpu_percent: 1.2, memory_usage: 20971520, memory_limit: 134217728, memory_percent: 15.6, network_rx: 892345, network_tx: 756234, uptime: '7d 11h 32m', created: timeAgo(10800), ports: ['6379:6379'], labels: { env: 'production', tier: 'cache' } },
  { id: 'e5f6a7b8c9d0', name: 'celery-async-worker', image: 'python:3.11-slim', status: 'running', cpu_percent: 45.8, memory_usage: 209715200, memory_limit: 536870912, memory_percent: 39.1, network_rx: 345678, network_tx: 123456, uptime: '1d 4h 12m', created: timeAgo(1700), ports: [], labels: { env: 'production', tier: 'worker' } },
  { id: 'f6a7b8c9d0e1', name: 'prometheus-collector', image: 'prom/prometheus:v2.48.0', status: 'running', cpu_percent: 3.6, memory_usage: 104857600, memory_limit: 268435456, memory_percent: 39.1, network_rx: 1567890, network_tx: 234567, uptime: '15d 6h 48m', created: timeAgo(21900), ports: ['9090:9090'], labels: { env: 'infra', tier: 'metrics' } },
  { id: '0a1b2c3d4e5f', name: 'grafana-dashboard', image: 'grafana/grafana:10.2.0', status: 'running', cpu_percent: 4.2, memory_usage: 83886080, memory_limit: 268435456, memory_percent: 31.2, network_rx: 432100, network_tx: 521400, uptime: '4d 18h 10m', created: timeAgo(6800), ports: ['3000:3000'], labels: { env: 'infra' } },
  { id: '1b2c3d4e5f6a', name: 'mailhog-smtp-mock', image: 'mailhog/mailhog:latest', status: 'stopped', cpu_percent: 0, memory_usage: 0, memory_limit: 134217728, memory_percent: 0, network_rx: 0, network_tx: 0, uptime: 'Stopped (exited 0)', created: timeAgo(5000), ports: ['1025:1025', '8025:8025'], labels: { env: 'dev' } },
  { id: '2c3d4e5f6a7b', name: 'e2e-test-runner', image: 'node:18-bullseye', status: 'exited', cpu_percent: 0, memory_usage: 0, memory_limit: 268435456, memory_percent: 0, network_rx: 0, network_tx: 0, uptime: 'Exited 3h ago', created: timeAgo(180), ports: [], labels: { env: 'ci' } },
];

export const DEMO_SYSTEM_METRICS: SystemMetrics = {
  cpu: {
    percent: 34.2,
    count_logical: 8,
    count_physical: 4,
    freq_current: 3600,
    per_cpu: [45, 23, 67, 12, 38, 54, 29, 41],
  },
  memory: {
    total: 17179869184,
    available: 7516192768,
    used: 9663676416,
    percent: 56.3,
    swap_total: 4294967296,
    swap_used: 536870912,
    swap_percent: 12.5,
  },
  disk: {
    total: 500107862016,
    used: 187904819200,
    free: 312203042816,
    percent: 37.6,
    read_bytes: 1234567890,
    write_bytes: 987654321,
  },
  network: {
    bytes_sent: 5678901234,
    bytes_recv: 12345678901,
    packets_sent: 4567890,
    packets_recv: 8901234,
  },
  system: {
    hostname: 'nexamonitor-node-01',
    os: 'Linux 6.5.0-28-generic (Ubuntu 22.04 LTS)',
    architecture: 'x86_64',
    uptime_seconds: 1382400,
    boot_time: timeAgo(23040),
  },
  timestamp: now.toISOString(),
};

export const DEMO_ALERTS: Alert[] = [
  { id: 1, container_id: 'e5f6a7b8c9d0', container_name: 'celery-async-worker', severity: 'critical', message: 'CPU utilization reached 92.4% (> 90.0% threshold) for sustained 5m', is_acknowledged: false, created_at: timeAgo(5), acknowledged_at: null },
  { id: 2, container_id: 'b2c3d4e5f6a7', container_name: 'nexamonitor-backend', severity: 'warning', message: 'Memory allocation elevated at 78.3% threshold limit', is_acknowledged: false, created_at: timeAgo(18), acknowledged_at: null },
  { id: 3, container_id: null, container_name: null, severity: 'warning', message: 'Host disk mount /var/lib/docker exceeding 80% storage threshold', is_acknowledged: false, created_at: timeAgo(42), acknowledged_at: null },
  { id: 4, container_id: 'f6a7b8c9d0e1', container_name: 'prometheus-collector', severity: 'info', message: 'Container automatically restarted following configuration reload', is_acknowledged: false, created_at: timeAgo(115), acknowledged_at: null },
  { id: 5, container_id: 'c3d4e5f6a7b8', container_name: 'postgres-db-primary', severity: 'warning', message: 'Buffer cache lock wait time exceeded 120ms', is_acknowledged: true, created_at: timeAgo(240), acknowledged_at: timeAgo(195) },
  { id: 6, container_id: '1b2c3d4e5f6a', container_name: 'mailhog-smtp-mock', severity: 'info', message: 'Container stopped cleanly by orchestrator', is_acknowledged: true, created_at: timeAgo(480), acknowledged_at: timeAgo(420) },
];

export const DEMO_IMAGES: DockerImage[] = [
  { id: 'sha256:7a4c9b3d1e', name: 'nginx', tag: '1.25-alpine', tags: ['nginx:1.25-alpine', 'nginx:alpine'], size: 43245600, created: timeAgo(2800), container_count: 1, in_use: true },
  { id: 'sha256:9f2e4d6a8b', name: 'python', tag: '3.11-slim', tags: ['python:3.11-slim'], size: 154200000, created: timeAgo(4200), container_count: 2, in_use: true },
  { id: 'sha256:3c8d1e5a7b', name: 'postgres', tag: '15-alpine', tags: ['postgres:15-alpine', 'postgres:15'], size: 379100000, created: timeAgo(6100), container_count: 1, in_use: true },
  { id: 'sha256:5b6a7c8d9e', name: 'redis', tag: '7.2-alpine', tags: ['redis:7.2-alpine', 'redis:latest'], size: 38400000, created: timeAgo(1400), container_count: 1, in_use: true },
  { id: 'sha256:1a2b3c4d5e', name: 'prom/prometheus', tag: 'v2.48.0', tags: ['prom/prometheus:v2.48.0', 'prom/prometheus:latest'], size: 248900000, created: timeAgo(5200), container_count: 1, in_use: true },
  { id: 'sha256:2b3c4d5e6f', name: 'grafana/grafana', tag: '10.2.0', tags: ['grafana/grafana:10.2.0'], size: 387000000, created: timeAgo(4900), container_count: 1, in_use: true },
  { id: 'sha256:4d5e6f7a8b', name: 'mailhog/mailhog', tag: 'latest', tags: ['mailhog/mailhog:latest'], size: 54600000, created: timeAgo(9500), container_count: 1, in_use: false },
  { id: 'sha256:6f7a8b9c0d', name: 'node', tag: '18-bullseye', tags: ['node:18-bullseye', 'node:18'], size: 980000000, created: timeAgo(300), container_count: 1, in_use: true },
  { id: 'sha256:8b9c0d1e2f', name: 'ubuntu', tag: '22.04', tags: ['ubuntu:22.04', 'ubuntu:jammy'], size: 77800000, created: timeAgo(15000), container_count: 0, in_use: false },
  { id: 'sha256:0d1e2f3a4b', name: 'alpine', tag: '3.19', tags: ['alpine:3.19', 'alpine:latest'], size: 7380000, created: timeAgo(8800), container_count: 0, in_use: false },
  { id: 'sha256:d1e2f3a4b5', name: 'golang', tag: '1.22-alpine', tags: ['golang:1.22-alpine'], size: 305000000, created: timeAgo(7200), container_count: 0, in_use: false },
];

export function generateCpuSeries(points = 30, base = 35): ChartDataPoint[] {
  return Array.from({ length: points }, (_, i) => {
    const d = new Date(now.getTime() - (points - i) * 2 * 60 * 1000);
    return {
      time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      cpu: Math.max(2, Math.min(98, Math.round((base + Math.sin(i / 3) * 14 + (Math.random() - 0.5) * 8) * 10) / 10)),
      memory: Math.max(10, Math.min(95, Math.round((54 + Math.cos(i / 4) * 6 + (Math.random() - 0.5) * 4) * 10) / 10)),
    };
  });
}

export function generateNetworkSeries(points = 30): ChartDataPoint[] {
  return Array.from({ length: points }, (_, i) => {
    const d = new Date(now.getTime() - (points - i) * 2 * 60 * 1000);
    return {
      time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      network_rx: Math.floor(250 + Math.sin(i / 2) * 120 + Math.random() * 80),
      network_tx: Math.floor(180 + Math.cos(i / 2) * 90 + Math.random() * 60),
    };
  });
}

export function generateContainerMetricSeries(containerName: string, baseCpu: number, baseMem: number, points = 24): ChartDataPoint[] {
  return Array.from({ length: points }, (_, i) => {
    const d = new Date(now.getTime() - (points - i) * 3 * 60 * 1000);
    return {
      time: d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      cpu: Math.max(0, Math.min(100, Math.round((baseCpu + Math.sin(i) * 6 + (Math.random() - 0.5) * 4) * 10) / 10)),
      memory: Math.max(0, Math.min(100, Math.round((baseMem + (Math.random() - 0.5) * 2) * 10) / 10)),
    };
  });
}
