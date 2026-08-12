import { getToken } from './auth';
import type {
  ChangeEvent, Destination, Paginated, PeriodReport, PingSample, ReportCompare, ReportPeriod, SearchResults, Stats,
  TraceReport, TrendPoint,
} from './types';

const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${BASE}${path}`, { headers, ...options });
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error((body as { error?: string } | null)?.error || `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  /* --- auth --- */
  login: (password: string) =>
    request<{ token: string; expiresAt: number }>('/admin/login', {
      method: 'POST',
      body: JSON.stringify({ password }),
    }),

  /* --- upstream trace monitoring --- */
  stats: () => request<Stats>('/stats'),
  statsTrend: (hours = 24) => request<TrendPoint[]>(`/stats/trend?hours=${hours}`),

  listDestinations: () => request<Destination[]>('/destinations'),
  getDestination: (id: string) => request<Destination>(`/destinations/${id}`),
  createDestination: (body: Partial<Destination>) =>
    request<Destination>('/destinations', { method: 'POST', body: JSON.stringify(body) }),
  updateDestination: (id: string, body: Partial<Destination>) =>
    request<Destination>(`/destinations/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
  deleteDestination: (id: string) => request<{ ok: boolean }>(`/destinations/${id}`, { method: 'DELETE' }),
  deleteDestinationData: (id: string) =>
    request<{ ok: boolean; deleted: { reports: number; changes: number; pings: number } }>(
      `/destinations/${id}/data`,
      { method: 'DELETE' }
    ),
  enrichDestinations: () =>
    request<{ total: number; enriched: number; failed: number }>('/destinations/enrich', { method: 'POST' }),

  listReports: (params?: { destinationId?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.destinationId) qs.set('destinationId', params.destinationId);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return request<Paginated<TraceReport>>(`/reports?${qs.toString()}`);
  },
  latestReports: () => request<TraceReport[]>('/reports/latest'),
  getReport: (id: string) => request<TraceReport>(`/reports/${id}`),
  compareReport: (id: string) => request<ReportCompare>(`/reports/${id}/compare`),
  periodReport: (period: ReportPeriod, destinationId?: string) => {
    const qs = new URLSearchParams({ period });
    if (destinationId) qs.set('destinationId', destinationId);
    return request<PeriodReport>(`/reports/period?${qs.toString()}`);
  },

  listChanges: (params?: { destinationId?: string; severity?: string; page?: number; limit?: number }) => {
    const qs = new URLSearchParams();
    if (params?.destinationId) qs.set('destinationId', params.destinationId);
    if (params?.severity) qs.set('severity', params.severity);
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    return request<Paginated<ChangeEvent>>(`/changes?${qs.toString()}`);
  },
  acknowledgeChange: (id: string) =>
    request<ChangeEvent>(`/changes/${id}/acknowledge`, { method: 'POST' }),
  acknowledgeAllChanges: (destinationId?: string) =>
    request<{ acknowledged: number }>('/changes/acknowledge-all', {
      method: 'POST',
      body: JSON.stringify(destinationId ? { destinationId } : {}),
    }),

  listPings: (destinationId: string, limit = 500) =>
    request<PingSample[]>(`/pings/${destinationId}?limit=${limit}`),

  runTrace: (destinationId?: string) =>
    request<{ reportId?: string; traced?: number; changesDetected?: number; changeCount?: number; error?: string }>(
      '/traces/run',
      { method: 'POST', body: JSON.stringify(destinationId ? { destinationId } : {}) }
    ),
  traceStatus: () => request<{ running: boolean }>('/traces/status'),

  /* --- global search --- */
  search: (q: string) => request<SearchResults>(`/search?q=${encodeURIComponent(q)}`),
};
