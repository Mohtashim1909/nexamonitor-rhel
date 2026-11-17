import type {
  DockerStatus,
  ContainerActionResponse,
  ContainerLogsResponse,
  ContainerStats,
  DockerImage,
  HealthStatus,
  Alert,
  AlertCounts,
  AlertSettings,
  ContainerLimits,
  ContainerLimitUpdateRequest,
  ImageInspectData,
  ImagePruneResponse,
  ResourceInsight,
  InsightsSummary,
  MonitoringReport,
} from '@/types';

const BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!response.ok) {
    let errorDetail = `HTTP ${response.status}: ${response.statusText}`;
    try {
      const errBody = await response.json();
      if (errBody && errBody.detail) {
        errorDetail = typeof errBody.detail === 'string' ? errBody.detail : JSON.stringify(errBody.detail);
      }
    } catch {
      // Ignore json parse error on error response
    }
    throw new ApiError(response.status, errorDetail);
  }
  return response.json();
}

export const api = {
  health: () => request<HealthStatus>('/api/health'),
  docker: {
    status: () => request<DockerStatus>('/api/docker/status'),
  },
  containers: {
    list: (all = true) => request<any[]>(`/api/containers?all=${all}`),
    get: (id: string) => request<any>(`/api/containers/${id}`),
    stats: (id: string) => request<ContainerStats>(`/api/containers/${id}/stats`),
    start: (id: string) =>
      request<ContainerActionResponse>(`/api/containers/${id}/start`, { method: 'POST' }),
    stop: (id: string, timeout = 10) =>
      request<ContainerActionResponse>(`/api/containers/${id}/stop?timeout=${timeout}`, {
        method: 'POST',
      }),
    restart: (id: string, timeout = 10) =>
      request<ContainerActionResponse>(`/api/containers/${id}/restart?timeout=${timeout}`, {
        method: 'POST',
      }),
    remove: (id: string, force = false, v = false) =>
      request<ContainerActionResponse>(`/api/containers/${id}?force=${force}&v=${v}`, {
        method: 'DELETE',
      }),
    logs: (
      id: string,
      tail = 100,
      timestamps = true,
      stdout = true,
      stderr = true,
      search?: string,
      level?: string
    ) => {
      const params = new URLSearchParams({
        tail: String(tail),
        timestamps: String(timestamps),
        stdout: String(stdout),
        stderr: String(stderr),
      });
      if (search) params.append('search', search);
      if (level && level !== 'all') params.append('level', level);
      return request<ContainerLogsResponse>(`/api/containers/${id}/logs?${params.toString()}`);
    },
    downloadLogsUrl: (
      id: string,
      tail = 1000,
      timestamps = true,
      search?: string,
      level?: string
    ) => {
      const params = new URLSearchParams({
        tail: String(tail),
        timestamps: String(timestamps),
      });
      if (search) params.append('search', search);
      if (level && level !== 'all') params.append('level', level);
      return `${BASE_URL}/api/containers/${id}/logs/download?${params.toString()}`;
    },
    getLimits: (id: string) => request<ContainerLimits>(`/api/containers/${id}/limits`),
    updateLimits: (id: string, limits: ContainerLimitUpdateRequest) =>
      request<{ success: boolean; container_id: string; message: string; limits?: any }>(
        `/api/containers/${id}/limits`,
        {
          method: 'PUT',
          body: JSON.stringify(limits),
        }
      ),
  },
  system: {
    snapshot: () => request<any>('/api/system/snapshot'),
    cpu: () => request<any>('/api/system/cpu'),
    memory: () => request<any>('/api/system/memory'),
    disk: () => request<any>('/api/system/disk'),
  },
  alerts: {
    list: (params?: {
      status?: string;
      severity?: string;
      container_id?: string;
      limit?: number;
      offset?: number;
    }) => {
      const query = new URLSearchParams();
      if (params?.status) query.append('status', params.status);
      if (params?.severity) query.append('severity', params.severity);
      if (params?.container_id) query.append('container_id', params.container_id);
      if (params?.limit) query.append('limit', String(params.limit));
      if (params?.offset) query.append('offset', String(params.offset));
      const qs = query.toString();
      return request<Alert[]>(`/api/alerts/${qs ? `?${qs}` : ''}`);
    },
    active: (limit = 100) =>
      request<{ counts: AlertCounts; alerts: Alert[] }>(`/api/alerts/active?limit=${limit}`),
    counts: () => request<AlertCounts>('/api/alerts/counts'),
    history: (limit = 100, offset = 0) =>
      request<Alert[]>(`/api/alerts/history?limit=${limit}&offset=${offset}`),
    acknowledge: (id: number) =>
      request<{ status: string; alert: Alert }>(`/api/alerts/${id}/acknowledge`, {
        method: 'POST',
      }),
    acknowledgeAll: () =>
      request<{ status: string; acknowledged_count: number }>('/api/alerts/acknowledge-all', {
        method: 'POST',
      }),
    resolve: (id: number) =>
      request<{ status: string; alert: Alert }>(`/api/alerts/${id}/resolve`, {
        method: 'POST',
      }),
    getSettings: () => request<AlertSettings>('/api/alerts/settings'),
    updateSettings: (settings: Partial<AlertSettings>) =>
      request<AlertSettings>('/api/alerts/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      }),
  },
  images: {
    list: () => request<DockerImage[]>('/api/images/'),
    inspect: (id: string) => request<ImageInspectData>(`/api/images/${id}`),
    prune: (danglingOnly = true) =>
      request<ImagePruneResponse>(`/api/images/prune?dangling_only=${danglingOnly}`, {
        method: 'POST',
      }),
    remove: (id: string, force = false) =>
      request<{ success: boolean; image_id: string; message: string; reclaimed_bytes?: number }>(
        `/api/images/${id}?force=${force}`,
        { method: 'DELETE' }
      ),
  },
  insights: {
    list: (params?: { category?: string; severity?: string; container_id?: string }) => {
      const q = new URLSearchParams();
      if (params?.category) q.set('category', params.category);
      if (params?.severity) q.set('severity', params.severity);
      if (params?.container_id) q.set('container_id', params.container_id);
      return request<ResourceInsight[]>(`/api/insights?${q.toString()}`);
    },
    summary: () => request<InsightsSummary>('/api/insights/summary'),
    dismiss: (id: string) =>
      request<{ success: boolean; insight_id: string; message: string }>(
        `/api/insights/${id}/dismiss`,
        { method: 'POST' }
      ),
  },
  reports: {
    daily: () => request<MonitoringReport>('/api/reports/daily'),
    weekly: () => request<MonitoringReport>('/api/reports/weekly'),
    custom: (startTime: string, endTime: string) => {
      const q = new URLSearchParams({
        start_time: startTime,
        end_time: endTime,
      });
      return request<MonitoringReport>(`/api/reports/custom?${q.toString()}`);
    },
    downloadCsvUrl: (reportType: string, startTime?: string, endTime?: string) => {
      const q = new URLSearchParams();
      if (startTime) q.set('start_time', startTime);
      if (endTime) q.set('end_time', endTime);
      const qs = q.toString();
      return `${BASE_URL}/api/reports/${reportType}/export/csv${qs ? `?${qs}` : ''}`;
    },
    downloadPdfUrl: (reportType: string, startTime?: string, endTime?: string) => {
      const q = new URLSearchParams();
      if (startTime) q.set('start_time', startTime);
      if (endTime) q.set('end_time', endTime);
      const qs = q.toString();
      return `${BASE_URL}/api/reports/${reportType}/export/pdf${qs ? `?${qs}` : ''}`;
    },
  },
  monitoring: {
    getSettings: () => request<{ interval_ms: number; persistence_interval_ms: number; retention_days: number; is_active: boolean; connected_clients: number }>('/api/monitoring/settings'),
    updateSettings: (params: number | { interval_ms?: number; persistence_interval_ms?: number; retention_days?: number }) => {
      const body = typeof params === 'number' ? { interval_ms: params } : params;
      return request<{ interval_ms: number; persistence_interval_ms: number; retention_days: number; is_active: boolean; connected_clients: number }>('/api/monitoring/settings', {
        method: 'POST',
        body: JSON.stringify(body),
      });
    },
    snapshot: () => request<any>('/api/monitoring/snapshot'),
  },
  analytics: {
    history: (
      containerId: string,
      params?: { time_range?: string; start_time?: string; end_time?: string; interval?: string; metric?: string }
    ) => {
      const q = new URLSearchParams();
      if (params?.time_range) q.set('time_range', params.time_range);
      if (params?.start_time) q.set('start_time', params.start_time);
      if (params?.end_time) q.set('end_time', params.end_time);
      if (params?.interval) q.set('interval', params.interval);
      if (params?.metric) q.set('metric', params.metric);
      return request<any>(`/api/analytics/containers/${containerId}/history?${q.toString()}`);
    },
    summary: (
      containerId: string,
      params?: { time_range?: string; start_time?: string; end_time?: string }
    ) => {
      const q = new URLSearchParams();
      if (params?.time_range) q.set('time_range', params.time_range);
      if (params?.start_time) q.set('start_time', params.start_time);
      if (params?.end_time) q.set('end_time', params.end_time);
      return request<any>(`/api/analytics/containers/${containerId}/summary?${q.toString()}`);
    },
    overview: (params?: { time_range?: string; start_time?: string; end_time?: string }) => {
      const q = new URLSearchParams();
      if (params?.time_range) q.set('time_range', params.time_range);
      if (params?.start_time) q.set('start_time', params.start_time);
      if (params?.end_time) q.set('end_time', params.end_time);
      return request<any>(`/api/analytics/overview?${q.toString()}`);
    },
    comparison: (params?: { container_ids?: string[]; time_range?: string; start_time?: string; end_time?: string; metric?: string }) => {
      const q = new URLSearchParams();
      if (params?.container_ids && params.container_ids.length > 0) {
        q.set('container_ids', params.container_ids.join(','));
      }
      if (params?.time_range) q.set('time_range', params.time_range);
      if (params?.start_time) q.set('start_time', params.start_time);
      if (params?.end_time) q.set('end_time', params.end_time);
      if (params?.metric) q.set('metric', params.metric);
      return request<any>(`/api/analytics/containers/comparison?${q.toString()}`);
    },
    topConsumers: (params?: { time_range?: string; metric?: string; limit?: number; sort_by?: string }) => {
      const q = new URLSearchParams();
      if (params?.time_range) q.set('time_range', params.time_range);
      if (params?.metric) q.set('metric', params.metric);
      if (params?.limit) q.set('limit', params.limit.toString());
      if (params?.sort_by) q.set('sort_by', params.sort_by);
      return request<any>(`/api/analytics/top-consumers?${q.toString()}`);
    },
    cleanupRetention: (retention_days = 30) =>
      request<{ success: boolean; deleted_records: number; retention_days: number; message: string }>(
        `/api/analytics/retention/cleanup?retention_days=${retention_days}`,
        { method: 'POST' }
      ),
  },
};
