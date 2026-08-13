import prisma from '../config/prisma';
import { env } from '../config/env';

/**
 * Deletes monitoring data older than RETENTION_DAYS (default 365).
 * Runs daily via the scheduler so the database never grows without bound.
 */
export async function runRetention(): Promise<{ traceReports: number; pingSamples: number; changeEvents: number }> {
  const cutoff = new Date(Date.now() - env.retentionDays * 24 * 3600 * 1000);

  const [traceReports, pingSamples, changeEvents] = await Promise.all([
    prisma.traceReport.deleteMany({ where: { startedAt: { lt: cutoff } } }),
    prisma.pingSample.deleteMany({ where: { sampledAt: { lt: cutoff } } }),
    prisma.changeEvent.deleteMany({ where: { createdAt: { lt: cutoff } } }),
  ]);

  const result = {
    traceReports: traceReports.count,
    pingSamples: pingSamples.count,
    changeEvents: changeEvents.count,
  };
  console.log(
    `[retention] purged data older than ${cutoff.toISOString()}: ` +
      `traceReports=${result.traceReports} pingSamples=${result.pingSamples} changeEvents=${result.changeEvents}`
  );
  return result;
}
