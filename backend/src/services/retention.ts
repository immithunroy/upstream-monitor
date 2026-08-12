import { TraceReport } from '../models/TraceReport';
import { PingSample } from '../models/PingSample';
import { ChangeEvent } from '../models/ChangeEvent';
import { env } from '../config/env';

/**
 * Deletes monitoring data older than RETENTION_DAYS (default 365).
 * Runs daily via the scheduler so the database never grows without bound.
 */
export async function runRetention(): Promise<{ traceReports: number; pingSamples: number; changeEvents: number }> {
  const cutoff = new Date(Date.now() - env.retentionDays * 24 * 3600 * 1000);

  const [traceReports, pingSamples, changeEvents] = await Promise.all([
    TraceReport.deleteMany({ startedAt: { $lt: cutoff } }),
    PingSample.deleteMany({ sampledAt: { $lt: cutoff } }),
    ChangeEvent.deleteMany({ createdAt: { $lt: cutoff } }),
  ]);

  const result = {
    traceReports: traceReports.deletedCount,
    pingSamples: pingSamples.deletedCount,
    changeEvents: changeEvents.deletedCount,
  };
  console.log(
    `[retention] purged data older than ${cutoff.toISOString()}: ` +
      `traceReports=${result.traceReports} pingSamples=${result.pingSamples} changeEvents=${result.changeEvents}`
  );
  return result;
}
