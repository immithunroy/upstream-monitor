import dotenv from 'dotenv';

dotenv.config();

function int(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

function float(name: string, fallback: number): number {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: int('PORT', 5020),
  mongoUri: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/upstream_monitor',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  traceCron: process.env.TRACE_CRON || '0 */6 * * *',
  pingCount: int('PING_COUNT', 10),
  pingTimeoutMs: int('PING_TIMEOUT_MS', 2500),
  pingIntervalMinutes: int('PING_INTERVAL_MINUTES', 5),
  traceMaxHops: int('TRACEROUTE_MAX_HOPS', 30),
  traceTimeoutSeconds: int('TRACEROUTE_TIMEOUT_SECONDS', 4),
  rttChangePercentThreshold: float('RTT_CHANGE_PERCENT_THRESHOLD', 30),
  rttChangeAbsThresholdMs: float('RTT_CHANGE_ABS_THRESHOLD_MS', 15),
  packetLossThreshold: float('PACKET_LOSS_THRESHOLD', 5),

  /* Admin panel */
  adminPassword: process.env.ADMIN_PASSWORD || 'admin',
  authTokenSecret: process.env.AUTH_TOKEN_SECRET || 'change-me-auth-secret',
  adminTokenTtlSeconds: int('ADMIN_TOKEN_TTL_SECONDS', 12 * 3600),

  /* RIR ASN/company enrichment */
  rirRequestTimeoutMs: int('RIR_REQUEST_TIMEOUT_MS', 10000),
  rirEnrichConcurrency: int('RIR_ENRICH_CONCURRENCY', 6),
  rirCacheTtlHours: int('RIR_CACHE_TTL_HOURS', 24),

  /* Data retention: purge monitoring data older than this many days. */
  retentionDays: int('RETENTION_DAYS', 365),
};
