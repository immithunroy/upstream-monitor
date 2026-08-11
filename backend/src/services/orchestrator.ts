import { Destination, DestinationDoc } from '../models/Destination';
import { ChangeEvent, ChangeEventDoc } from '../models/ChangeEvent';
import { TraceReport, TraceReportDoc } from '../models/TraceReport';
import { compareReports } from './comparator';
import { runTrace } from './traceroute';
import { enrichHops, maybeEnrichDestination } from './enrich';

export interface TraceRunResult {
  report: TraceReportDoc;
  changeEvent: ChangeEventDoc | null;
}

/** Runs ping+traceroute for a single destination, stores the report, and
 *  compares it against the previous report for the same destination. */
export async function traceDestination(dest: DestinationDoc, triggeredBy: 'scheduler' | 'manual' = 'scheduler'): Promise<TraceRunResult> {
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

  const report = (await TraceReport.create({
    destinationId: dest._id,
    destHost: dest.host,
    destName: dest.name,
    asn: dest.asn ?? null,
    company: dest.company ?? '',
    triggeredBy,
    startedAt,
    completedAt: new Date(),
    durationMs: Date.now() - startedMs,
    reachable: outcome.reachable,
    ping: outcome.ping,
    hops,
    pathFingerprint: outcome.pathFingerprint,
  })) as unknown as TraceReportDoc;

  // Keep RIR attribution fresh in the background (skips when enriched recently).
  void maybeEnrichDestination(dest._id as unknown as string, dest.host);

  // Find the previous report (excluding this one) for the same destination.
  const prev = await TraceReport.findOne({
    destinationId: dest._id,
    _id: { $ne: report._id },
  })
    .sort({ startedAt: -1 })
    .lean();

  let changeEvent: ChangeEventDoc | null = null;
  if (prev) {
    const comparison = compareReports(prev as unknown as TraceReportDoc, report as unknown as TraceReportDoc);
    if (comparison.changes.length > 0) {
      changeEvent = await ChangeEvent.create({
        destinationId: dest._id,
        destHost: dest.host,
        destName: dest.name,
        severity: comparison.severity,
        summary: comparison.summary,
        previousReportId: prev._id,
        currentReportId: report._id,
        changes: comparison.changes,
      });
    }
  }

  return { report, changeEvent };
}

/** Traces every enabled destination, sequentially, and returns per-destination results. */
export async function traceAll(triggeredBy: 'scheduler' | 'manual' = 'scheduler'): Promise<TraceRunResult[]> {
  const dests = await Destination.find({ enabled: true }).sort({ name: 1 }).lean();
  const results: TraceRunResult[] = [];
  for (const dest of dests as unknown as DestinationDoc[]) {
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
