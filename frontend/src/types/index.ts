export interface Container {
  id: string;
  name: string;
  image: string;
  status: 'running' | 'stopped' | 'paused' | 'restarting' | 'exited';
  cpu_percent: number;
  memory_usage: number;
  memory_limit: number;
  memory_percent: number;
  network_rx: number;
  network_tx: number;
  network_rx_bytes_per_sec?: number;
  network_tx_bytes_per_sec?: number;
  network_rx_mbps?: number;
  network_tx_mbps?: number;
  disk_read_bytes?: number;
  disk_write_bytes?: number;
  uptime: string;
  created: string;
  ports: string[];
  labels: Record<string, string>;
  last_updated?: string;
  is_monitored?: boolean;
}

export type WebSocketStatus = 'CONNECTED' | 'CONNECTING' | 'RECONNECTING' | 'DISCONNECTED';

export interface LiveContainerMetric {
  container_id: string;
  container_name: string;
  status: string;
  cpu_usage_percent: number;
  cpu_usage_total: number;
  cpu_system_usage: number;
  cpu_count: number;
  memory_usage_bytes: number;
  memory_limit_bytes: number;
  memory_usage_percent: number;
  memory_cache_bytes: number;
  memory_available_bytes: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
  network_rx_packets: number;
  network_tx_packets: number;
  network_rx_errors: number;
  network_tx_errors: number;
  network_rx_dropped: number;
  network_tx_dropped: number;
  network_rx_bytes_per_sec: number;
  network_tx_bytes_per_sec: number;
  network_rx_mbps: number;
  network_tx_mbps: number;
  disk_read_bytes?: number;
  disk_write_bytes?: number;
  disk_read_bytes_per_sec?: number;
  disk_write_bytes_per_sec?: number;
  timestamp: string;
}

export interface MonitoringSettings {
  interval_ms: number;
  is_active: boolean;
  connected_clients: number;
}

export interface SystemMetrics {
  cpu: {
    percent: number;
    count_logical: number;
    count_physical: number;
    freq_current: number;
    per_cpu: number[];
  };
  memory: {
    total: number;
    available: number;
    used: number;
    percent: number;
    swap_total: number;
    swap_used: number;
    swap_percent: number;
  };
  disk: {
    total: number;
    used: number;
    free: number;
    percent: number;
    read_bytes: number;
    write_bytes: number;
  };
  network: {
    bytes_sent: number;
    bytes_recv: number;
    packets_sent: number;
    packets_recv: number;
  };
  system: {
    hostname: string;
    os: string;
    architecture: string;
    uptime_seconds: number;
    boot_time: string;
  };
  timestamp: string;
}

export interface Alert {
  id: number;
  container_id: string | null;
  container_name: string | null;
  alert_type?: string;
  severity: 'critical' | 'warning' | 'info';
  status?: 'ACTIVE' | 'ACKNOWLEDGED' | 'RESOLVED';
  title?: string;
  message: string;
  description?: string | null;
  observed_value?: number | null;
  threshold_value?: number | null;
  occurrence_count?: number;
  is_acknowledged: boolean;
  created_at: string;
  triggered_at?: string;
  last_occurrence?: string;
  acknowledged_at: string | null;
  resolved_at?: string | null;
}

export interface AlertCounts {
  critical: number;
  warning: number;
  info: number;
  active: number;
  resolved: number;
  total: number;
}

export interface AlertSettings {
  cpu_warning_threshold: number;
  cpu_critical_threshold: number;
  cpu_recovery_warning: number;
  cpu_recovery_critical: number;
  memory_warning_threshold: number;
  memory_critical_threshold: number;
  memory_recovery_warning: number;
  memory_recovery_critical: number;
  disk_warning_threshold: number;
  disk_critical_threshold: number;
  container_lifecycle_enabled: boolean;
  docker_daemon_enabled: boolean;
  enabled: boolean;
}

export interface DockerImage {
  id: string;
  name: string;
  tag: string;
  tags: string[];
  size: number;
  created: string;
  container_count?: number;
  in_use?: boolean;
  is_dangling?: boolean;
  status?: 'in_use' | 'unused' | 'dangling';
}

export interface ChartDataPoint {
  time: string;
  cpu?: number;
  memory?: number;
  network_rx?: number;
  network_tx?: number;
  value?: number;
  rx?: number;
  tx?: number;
  [key: string]: string | number | undefined;
}

export interface HealthStatus {
  status: string;
  version: string;
  docker_connected: boolean;
  database_connected: boolean;
  timestamp: string;
}

export interface DockerStatus {
  connected: boolean;
  server_version?: string;
  api_version?: string;
  operating_system?: string;
  architecture?: string;
  containers_count?: number;
  images_count?: number;
  docker_host?: string;
  error?: string;
}

export interface ContainerStats {
  container_id: string;
  container_name: string;
  status: string;
  read: string;
  cpu: {
    usage: number;
    percent: number;
    system_cpu_usage: number;
    online_cpus: number;
  };
  memory: {
    usage: number;
    limit: number;
    percent: number;
    cache: number;
    stats?: Record<string, any>;
  };
  network: {
    rx_bytes: number;
    tx_bytes: number;
    rx_packets: number;
    tx_packets: number;
    rx_errors: number;
    tx_errors: number;
    rx_dropped: number;
    tx_dropped: number;
    interfaces?: Record<string, any>;
  };
  disk_io: {
    read_bytes: number;
    write_bytes: number;
    read_ops: number;
    write_ops: number;
  };
  pids_current?: number;
}

export interface ContainerActionResponse {
  success: boolean;
  action: string;
  container_id: string;
  message: string;
}

export interface LogEntry {
  timestamp: string;
  level: 'DEBUG' | 'INFO' | 'WARN' | 'ERROR' | 'CRITICAL';
  message: string;
  raw: string;
  stream: 'stdout' | 'stderr';
}

export interface ContainerLogsResponse {
  container_id: string;
  container_name?: string | null;
  lines: string[];
  total_lines: number;
  filtered_lines?: number;
  entries?: LogEntry[];
}

export type TimeRange = '15m' | '30m' | '1h' | '6h' | '12h' | '24h' | '7d' | '30d' | 'custom';
export type AlertSeverity = 'critical' | 'warning' | 'info';
export type ContainerStatus = 'running' | 'stopped' | 'paused' | 'all';

// Phase 4 Historical Analytics Types
export interface MetricHistoryPoint {
  timestamp: string;
  time: string;
  cpu?: number;
  cpu_avg?: number;
  cpu_max?: number;
  cpu_min?: number;
  memory?: number;
  memory_percent?: number;
  memory_max?: number;
  memory_min?: number;
  network_rx_speed?: number;
  network_tx_speed?: number;
  network_rx_kb?: number;
  network_tx_kb?: number;
  disk_read_speed?: number;
  disk_write_speed?: number;
  disk_read_kb?: number;
  disk_write_kb?: number;
}

export interface ContainerHistoryResponse {
  container_id: string;
  container_name?: string;
  start_time: string;
  end_time: string;
  interval: string;
  metric: string;
  points: MetricHistoryPoint[];
}

export interface MetricStats {
  avg: number;
  max: number;
  min: number;
  trend: string;
}

export interface MemoryStats {
  avg_bytes: number;
  peak_bytes: number;
  min_bytes: number;
  avg_percent: number;
  peak_percent: number;
  limit_bytes: number;
}

export interface NetworkStats {
  total_rx_bytes: number;
  total_tx_bytes: number;
  avg_rx_speed: number;
  avg_tx_speed: number;
  peak_rx_speed: number;
  peak_tx_speed: number;
}

export interface DiskStats {
  total_read_bytes: number;
  total_write_bytes: number;
  avg_read_speed: number;
  avg_write_speed: number;
}

export interface ContainerSummaryResponse {
  container_id: string;
  container_name?: string;
  time_range: string;
  start_time: string;
  end_time: string;
  sample_count: number;
  cpu: MetricStats;
  memory: MemoryStats;
  network: NetworkStats;
  disk: DiskStats;
}

export interface ClusterOverviewAnalytics {
  time_range: string;
  start_time: string;
  end_time: string;
  total_containers_tracked: number;
  total_samples: number;
  cpu: MetricStats;
  memory: MemoryStats;
  network: NetworkStats;
  disk: DiskStats;
  series: ChartDataPoint[];
}

export interface ContainerComparisonMetric {
  container_id: string;
  container_name: string;
  status?: string;
  uptime?: string;
  restart_count?: number;
  avg_cpu: number;
  peak_cpu: number;
  avg_memory_mb: number;
  peak_memory_mb: number;
  peak_memory_percent?: number;
  total_network_bytes: number;
  total_disk_bytes: number;
  is_highest_cpu?: boolean;
  is_highest_memory?: boolean;
  is_highest_network?: boolean;
  is_highest_disk?: boolean;
}

export interface ContainerComparisonResponse {
  time_range: string;
  start_time: string;
  end_time: string;
  containers: ContainerComparisonMetric[];
  series: ChartDataPoint[];
}

export interface ConsumerRanking {
  container_id: string;
  container_name: string;
  value: number;
  unit: string;
  avg_cpu: number;
  peak_cpu: number;
  avg_memory_mb: number;
  peak_memory_mb: number;
  network_rx_bytes: number;
  network_tx_bytes: number;
  disk_read_bytes: number;
  disk_write_bytes: number;
}

export interface TopConsumersResponse {
  time_range: string;
  metric: string;
  sort_by: string;
  rankings: ConsumerRanking[];
}

// Phase 6 & Phase 7 Types

export interface ContainerLimits {
  container_id: string;
  container_name: string;
  memory_limit_bytes: number;
  memory_limit_mb: number;
  memory_reservation_bytes: number;
  memory_reservation_mb: number;
  memory_swap_bytes: number;
  memory_swap_mb: number;
  cpu_shares: number;
  cpu_quota: number;
  cpu_period: number;
  nano_cpus: number;
  effective_cpus: number;
  live_memory_usage_bytes?: number;
  live_memory_usage_mb?: number;
  live_memory_percent?: number;
  live_cpu_percent?: number;
  update_supported?: boolean;
}

export interface ContainerLimitUpdateRequest {
  mem_limit?: number | string | null;
  mem_reservation?: number | string | null;
  memswap_limit?: number | string | null;
  cpu_shares?: number | null;
  cpu_quota?: number | null;
  cpu_period?: number | null;
  cpus?: number | null;
}

export interface ImageInspectData {
  id: string;
  tags: string[];
  created: string;
  size_bytes: number;
  size_mb: number;
  virtual_size_bytes: number;
  architecture: string;
  os: string;
  docker_version: string;
  author: string;
  entrypoint: string[];
  cmd: string[];
  env: string[];
  working_dir: string;
  labels: Record<string, string>;
  layer_count: number;
  layers: string[];
  exposed_ports: string[];
}

export interface ImagePruneResponse {
  success: boolean;
  images_deleted: string[];
  space_reclaimed_bytes: number;
  space_reclaimed_mb: number;
}

export interface ResourceInsight {
  id: string;
  rule_id: string;
  container_id: string;
  container_name: string;
  category: 'cpu' | 'memory' | 'stability' | 'network' | 'optimization';
  severity: 'critical' | 'warning' | 'info';
  title: string;
  description: string;
  recommendation: string;
  metrics: Record<string, any>;
  detected_at: string;
}

export interface InsightsSummary {
  total: number;
  critical: number;
  warning: number;
  info: number;
  by_category: {
    cpu: number;
    memory: number;
    stability: number;
    network: number;
    optimization: number;
  };
  insights: ResourceInsight[];
  generated_at: string;
}

export interface ReportSummary {
  report_type: 'daily' | 'weekly' | 'custom';
  start_time: string;
  end_time: string;
  total_containers_tracked: number;
  total_metric_samples: number;
  total_alerts_count: number;
  critical_alerts_count: number;
  warning_alerts_count: number;
  avg_cpu_percent: number;
  peak_cpu_percent: number;
  peak_cpu_container?: string;
  avg_memory_mb: number;
  peak_memory_mb: number;
  peak_memory_container?: string;
  total_network_rx_mb: number;
  total_network_tx_mb: number;
  total_disk_read_mb: number;
  total_disk_write_mb: number;
  container_restarts_detected: number;
}

export interface MonitoringReport {
  summary: ReportSummary;
  containers: Array<{
    container_id: string;
    container_name: string;
    avg_cpu_percent: number;
    peak_cpu_percent: number;
    avg_memory_mb: number;
    peak_memory_mb: number;
    network_rx_mb: number;
    network_tx_mb: number;
    disk_read_mb: number;
    disk_write_mb: number;
    alert_count: number;
  }>;
  top_consumers: {
    by_cpu: Array<{ container_name: string; value: number }>;
    by_memory: Array<{ container_name: string; value: number }>;
    by_network: Array<{ container_name: string; value: number }>;
  };
}
