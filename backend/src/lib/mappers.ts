import type {
  ChangeDetail,
  ChangeEvent as PrismaChangeEvent,
  Destination as PrismaDestination,
  PingSample as PrismaPingSample,
  TraceHop,
  TraceReport as PrismaTraceReport,
} from '@prisma/client';

/** Map a Prisma Destination row into the API shape (id -> _id). */
export function destToApi(d: PrismaDestination) {
  const { id, ...rest } = d;
  return { _id: id, ...rest };
}

/** Map a Prisma PingSample row into the API shape. */
export function pingToApi(p: PrismaPingSample) {
  const { id, ...rest } = p;
  return { _id: id, ...rest };
}

export interface TraceReportRow extends PrismaTraceReport {
  hops: TraceHop[];
}

/** Map a Prisma TraceReport row (with hops included) into the API shape:
 *  `_id` plus the nested `ping` object the frontend expects. */
export function reportToApi(r: TraceReportRow) {
  const { id, hops, pingSuccess, pingPacketsSent, pingPacketsReceived, pingLossPercent, pingMinRtt, pingMaxRtt, pingAvgRtt, ...rest } =
    r;
  return {
    _id: id,
    ...rest,
    ping: {
      success: pingSuccess,
      packetsSent: pingPacketsSent,
      packetsReceived: pingPacketsReceived,
      lossPercent: pingLossPercent,
      minRtt: pingMinRtt,
      maxRtt: pingMaxRtt,
      avgRtt: pingAvgRtt,
    },
    hops: hops ?? [],
  };
}

export interface ChangeEventRow extends PrismaChangeEvent {
  changes: ChangeDetail[];
}

/** Convert a Prisma TraceHop row into the app's TraceHop shape (drop id/reportId). */
export function hopToApp(h: TraceHop): {
  ttl: number;
  ip: string | null;
  host: string | null;
  status: 'reachable' | 'unreachable';
  rtts: number[];
  avgRtt: number | null;
  asn: number | null;
  company: string;
} {
  return {
    ttl: h.ttl,
    ip: h.ip,
    host: h.host,
    status: h.status === 'reachable' ? 'reachable' : 'unreachable',
    rtts: Array.isArray(h.rtts) ? (h.rtts as number[]) : [],
    avgRtt: h.avgRtt,
    asn: h.asn,
    company: h.company,
  };
}

/** Map a Prisma ChangeEvent row (with changes included) into the API shape. */
export function changeToApi(c: ChangeEventRow) {
  const { id, ...rest } = c;
  return { _id: id, ...rest };
}

/** Map raw aggregations (e.g. `distinct on`) that come back as plain rows with
 *  `id`/`destination_id` keys into report-shaped objects for the dashboard. */
export function rawReportToApi(r: Record<string, unknown>) {
  return reportToApi({
    ...(r as unknown as TraceReportRow),
    hops: (r.hops as unknown as TraceHop[]) ?? [],
  });
}

/** Map a raw `SELECT *` row from Postgres (snake_case columns) into the Prisma
 *  TraceReport shape so `reportToApi` can serialize it to the API format. */
export function rawRowToReport(r: Record<string, unknown>): TraceReportRow {
  return {
    id: String(r.id ?? ''),
    destinationId: String(r.destinationId ?? ''),
    destHost: String(r.destHost ?? ''),
    destName: String(r.destName ?? ''),
    asn: r.asn != null ? Number(r.asn) : null,
    company: String(r.company ?? ''),
    triggeredBy: String(r.triggeredBy ?? 'scheduler'),
    startedAt: r.startedAt ? new Date(r.startedAt as string) : new Date(),
    completedAt: r.completedAt ? new Date(r.completedAt as string) : null,
    durationMs: Number(r.durationMs ?? 0),
    reachable: Boolean(r.reachable),
    pingSuccess: Boolean(r.pingSuccess),
    pingPacketsSent: Number(r.pingPacketsSent ?? 0),
    pingPacketsReceived: Number(r.pingPacketsReceived ?? 0),
    pingLossPercent: Number(r.pingLossPercent ?? 100),
    pingMinRtt: r.pingMinRtt != null ? Number(r.pingMinRtt) : null,
    pingMaxRtt: r.pingMaxRtt != null ? Number(r.pingMaxRtt) : null,
    pingAvgRtt: r.pingAvgRtt != null ? Number(r.pingAvgRtt) : null,
    pathFingerprint: String(r.pathFingerprint ?? ''),
    error: String(r.error ?? ''),
    createdAt: r.createdAt ? new Date(r.createdAt as string) : new Date(),
    updatedAt: r.updatedAt ? new Date(r.updatedAt as string) : new Date(),
    hops: [],
  };
}
