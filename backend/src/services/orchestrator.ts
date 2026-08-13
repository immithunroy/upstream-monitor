import prisma from '../config/prisma';
import { compareReports } from './comparator';
import { runTrace } from './traceroute';
import { enrichHops, maybeEnrichDestination } from './enrich';

export interface TraceRunResult {
  report: {
    id: string;
    destinationId: string;
    destHost: string;
    reachable: boolean;
    hops: Array<{ ttl: number }>;
  };
  changeEvent: {
    id: string | null;
    changes: Array<{ type: string }>;
  } | null;
}

export interface DestinationLike {
  id: string;
  host: string;
  name: string;
  asn?: number | null;
  company?: string;
}

/** Runs ping+traceroute for a single destination, stores the report, and
 *  compares it against the previous report for the same destination. */
export async function traceDestination(dest: DestinationLike, triggeredBy: 'scheduler' | 'manual' = 'scheduler'): Promise<TraceRunResult> {
  const startedAt = new Date();
  const startedMs = Date.now();

  let outcome;
  try {
    outcome = await runTrace(dest.host);
  } catch (err) {
    outcome = {
      reachable: false,
      ping: {
        success: false,
        packetsSent: 0,
        packetsReceived: 0,
        lossPercent: 100,
        minRtt: null,
        maxRtt: null,
        avgRtt: null,
      },
      hops: [],
      pathFingerprint: '',
    };
    console.error(`[trace] ${dest.host} failed:`, (err as Error).message);
  }

  // Attribute ASN + company to each hop IP (uses the shared RIR cache).
  let hops = outcome.hops;
  try {
    hops = await enrichHops(outcome.hops);
  } catch (err) {
    console.error(`[trace] hop enrichment failed for ${dest.host}:`, (err as Error).message);
  }

  const report = await prisma.traceReport.create({
    data: {
      destinationId: dest.id,
      destHost: dest.host,
      destName: dest.name,
      asn: dest.asn ?? null,
      company: dest.company ?? '',
      triggeredBy,
      startedAt,
      completedAt: new Date(),
      durationMs: Date.now() - startedMs,
      reachable: outcome.reachable,
      pingSuccess: outcome.ping.success,
      pingPacketsSent: outcome.ping.packetsSent,
      pingPacketsReceived: outcome.ping.packetsReceived,
      pingLossPercent: outcome.ping.lossPercent,
      pingMinRtt: outcome.ping.minRtt,
      pingMaxRtt: outcome.ping.maxRtt,
      pingAvgRtt: outcome.ping.avgRtt,
      pathFingerprint: outcome.pathFingerprint,
      hops: {
        create: hops.map((h) => ({
          ttl: h.ttl,
          ip: h.ip,
          host: h.host,
          status: h.status,
          rtts: h.rtts,
          avgRtt: h.avgRtt,
          asn: h.asn,
          company: h.company,
        })),
      },
    },
    include: { hops: true },
  });

  // Keep RIR attribution fresh in the background (skips when enriched recently).
  void maybeEnrichDestination(dest.id, dest.host);

  // Find the previous report (excluding this one) for the same destination.
  const prev = await prisma.traceReport.findFirst({
    where: { destinationId: dest.id, id: { not: report.id } },
    orderBy: { startedAt: 'desc' },
    include: { hops: true },
  });

  let changeEventId: string | null = null;
  let changeCount = 0;
  if (prev) {
    const prevDoc = {
      _id: prev.id as never,
      destinationId: prev.destinationId as never,
      destHost: prev.destHost,
      reachable: prev.reachable,
      ping: {
        lossPercent: prev.pingLossPercent,
        avgRtt: prev.pingAvgRtt,
      },
      hops: prev.hops,
      pathFingerprint: prev.pathFingerprint,
    } as never;
    const currDoc = {
      _id: report.id as never,
      destinationId: report.destinationId as never,
      destHost: report.destHost,
      reachable: report.reachable,
      ping: {
        lossPercent: report.pingLossPercent,
        avgRtt: report.pingAvgRtt,
      },
      hops: report.hops,
      pathFingerprint: report.pathFingerprint,
    } as never;
    const comparison = compareReports(prevDoc, currDoc);
    if (comparison.changes.length > 0) {
      const event = await prisma.changeEvent.create({
        data: {
          destinationId: dest.id,
          destHost: dest.host,
          destName: dest.name,
          severity: comparison.severity,
          summary: comparison.summary,
          previousReportId: prev.id,
          currentReportId: report.id,
          changes: {
            create: comparison.changes.map((c) => ({
              type: c.type,
              field: c.field ?? '',
              hopTtl: c.hopTtl ?? null,
              oldValue: c.oldValue !== undefined && c.oldValue !== null ? (c.oldValue as object) : undefined,
              newValue: c.newValue !== undefined && c.newValue !== null ? (c.newValue as object) : undefined,
              message: c.message,
            })),
          },
        },
        include: { changes: true },
      });
      changeEventId = event.id;
      changeCount = (event as { changes?: Array<unknown> }).changes?.length ?? 0;
    }
  }

  return {
    report: {
      id: report.id,
      destinationId: report.destinationId,
      destHost: report.destHost,
      reachable: report.reachable,
      hops: report.hops,
    },
    changeEvent: changeEventId ? { id: changeEventId, changes: [] } : null,
  };
}

/** Traces every enabled destination, sequentially, and returns per-destination results. */
export async function traceAll(triggeredBy: 'scheduler' | 'manual' = 'scheduler'): Promise<TraceRunResult[]> {
  const dests = await prisma.destination.findMany({ where: { enabled: true }, orderBy: { name: 'asc' } });
  const results: TraceRunResult[] = [];
  for (const dest of dests) {
    try {
      const r = await traceDestination(dest, triggeredBy);
      results.push(r);
      console.log(
        `[trace] ${dest.host} -> reachable=${r.report.reachable} hops=${r.report.hops.length} changes=${r.changeEvent ? r.changeEvent.changes.length : 0}`
      );
    } catch (err) {
      console.error(`[trace] error for ${dest.host}:`, (err as Error).message);
    }
  }
  return results;
}

/** Fired by the hourly scheduler. Returns a bool indicating whether the job is
 *  currently already running (to avoid overlapping executions). */
let running = false;
export async function runScheduledTrace(): Promise<boolean> {
  if (running) return false;
  running = true;
  try {
    await traceAll('scheduler');
  } finally {
    running = false;
  }
  return true;
}

export function isTracingRunning(): boolean {
  return running;
}
