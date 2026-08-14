import prisma from '../config/prisma';
import { getSettingNumber } from './settings';

/**
 * Deletes monitoring data older than the configured retention window
 * (default 365 days, tunable from Settings). Runs daily via the scheduler so
 * the database never grows without bound.
 */
export async function runRetention(): Promise<{ traceReports: number; pingSamples: number; changeEvents: number }> {
  const retentionDays = getSettingNumber('retentionDays', 365);
  const cutoff = new Date(Date.now() - retentionDays * 24 * 3600 * 1000);

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
