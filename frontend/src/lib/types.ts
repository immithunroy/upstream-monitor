export type DestinationCategory = 'service' | 'datacenter' | 'ixp' | 'utility' | 'cdn';
export type Severity = 'info' | 'warning' | 'critical';

export interface Destination {
  _id: string;
  name: string;
  host: string;
  category: DestinationCategory;
  location: string;
  region: string;
  description: string;
  enabled: boolean;
  /* RIR attribution */
  ipAddress: string;
  asn: number | null;
  company: string;
  registry: string;
  country: string;
  prefix: string;
  enrichedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TraceHop {
  ttl: number;
  ip: string | null;
  host: string | null;
  status: 'reachable' | 'unreachable';
  rtts: number[];
  avgRtt: number | null;
  asn: number | null;
  company: string;
}

export interface PingResult {
  success: boolean;
  packetsSent: number;
  packetsReceived: number;
  lossPercent: number;
  minRtt: number | null;
  maxRtt: number | null;
  avgRtt: number | null;
}

export interface TraceReport {
  _id: string;
  destinationId: string;
  destHost: string;
  destName: string;
  asn: number | null;
  company: string;
  triggeredBy: 'scheduler' | 'manual';
  startedAt: string;
  completedAt: string;
  durationMs: number;
  reachable: boolean;
  ping: PingResult;
  hops: TraceHop[];
  pathFingerprint: string;
  error?: string;
}

export interface ChangeDetail {
  type: string;
  field?: string;
  hopTtl?: number | null;
  oldValue?: unknown;
  newValue?: unknown;
  message: string;
}

export interface ChangeEvent {
  _id: string;
  destinationId: string;
  destHost: string;
  destName: string;
  severity: Severity;
  summary: string;
  previousReportId: string | null;
  currentReportId: string | null;
  changes: ChangeDetail[];
  acknowledged: boolean;
  createdAt: string;
}

export interface Stats {
  destinations: number;
  enabledDestinations: number;
  reports: number;
  changes: number;
  criticalChanges: number;
  unacknowledgedChanges: number;
  lastScheduledRunAt: string | null;
  recovery: { reachable: number; unreachable: number };
  networkLatencyMs: number | null;
  pingRecovery: { reachable: number; unreachable: number };
  uptime24h: number | null;
  avgRtt24h: number | null;
  tracingRunning: boolean;
}

export interface PingSample {
  _id: string;
  destinationId: string;
  destHost: string;
  destName: string;
  success: boolean;
  minRtt: number | null;
  maxRtt: number | null;
  avgRtt: number | null;
  lossPercent: number;
  packetsSent: number;
  packetsReceived: number;
  sampledAt: string;
}

export interface TrendPoint {
  at: string;
  samples: number;
  uptimePct: number;
  avgRtt: number | null;
}

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'half-yearly' | 'yearly';

export interface PeriodDestSummary {
  destinationId: string;
  name: string;
  host: string;
  asn: number | null;
  company: string;
  category: DestinationCategory;
  reports: number;
  uptimePct: number;
  avgRtt: number | null;
}

export interface PeriodReport {
  period: ReportPeriod;
  from: string;
  to: string;
  overall: {
    reports: number;
    reachable: number;
    uptimePct: number;
    avgRtt: number | null;
    changes: number;
  };
  destinations: PeriodDestSummary[];
  series: Array<{
    day: string;
    samples: number;
    uptimePct: number;
    avgRtt: number | null;
  }>;
}

export interface SearchResultGroup {
  type: 'destination' | 'change' | 'report';
  id: string;
  title: string;
  subtitle: string;
  path: string;
}

export interface SearchResults {
  query: string;
  destinations: SearchResultGroup[];
  changes: SearchResultGroup[];
  reports: SearchResultGroup[];
}

export interface Paginated<T> {
  total: number;
  page: number;
  limit: number;
  data: T[];
}

export type HopChange = 'same' | 'hop_added' | 'hop_removed' | 'hop_ip_change' | 'hop_as_change' | 'hop_rtt' | 'none';

export interface HopDiff {
  ttl: number;
  change: HopChange;
  prevIp: string | null;
  currIp: string | null;
  prevRtt: number | null;
  currRtt: number | null;
  prevAsn: number | null;
  currAsn: number | null;
  prevCompany: string;
  currCompany: string;
}

export interface ReportCompare {
  current: TraceReport;
  previous: TraceReport | null;
  diff: HopDiff[];
  hasPrevious: boolean;
}

export interface AppSettings {
  retentionDays: number;
  traceCron: string;
  pingIntervalMinutes: number;
  pingCount: number;
  pingTimeoutMs: number;
  traceMaxHops: number;
  traceTimeoutSeconds: number;
  rttChangePercentThreshold: number;
  rttChangeAbsThresholdMs: number;
  packetLossThreshold: number;
  rirCacheTtlHours: number;
  rirEnrichConcurrency: number;
  rirRequestTimeoutMs: number;
}

export interface SettingsResponse {
  settings: AppSettings;
  storage: {
    traceReports: number;
    pingSamples: number;
    changeEvents: number;
    destinations: number;
  };
}

export interface ImportResult {
  total: number;
  created: number;
  skipped: number;
  failed: number;
  errors: Array<{ row: number; host: string; error: string }>;
}
