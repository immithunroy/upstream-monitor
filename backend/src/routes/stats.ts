import { Router } from 'express';
import prisma from '../config/prisma';
import { isTracingRunning } from '../services/orchestrator';

const router = Router();

router.get('/', async (_req, res) => {
  const [destCount, enabledCount, reportCount, changeCount, criticalCount, unackedCount, destIds] =
    await Promise.all([
      prisma.destination.count(),
      prisma.destination.count({ where: { enabled: true } }),
      prisma.traceReport.count(),
      prisma.changeEvent.count(),
      prisma.changeEvent.count({ where: { severity: 'critical' } }),
      prisma.changeEvent.count({ where: { acknowledged: false } }),
      prisma.destination.findMany({ select: { id: true } }),
    ]);

  const latestReportRows = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT ON (destination_id) id, destination_id AS "destinationId", dest_host AS "destHost",
            dest_name AS "destName", asn, company, triggered_by AS "triggeredBy",
            started_at AS "startedAt", reachable, ping_avg_rtt AS "pingAvgRtt"
       FROM trace_reports
   ORDER BY destination_id, started_at DESC`
  ) as unknown as Array<Record<string, unknown>>;

  const validIds = new Set(destIds.map((d) => d.id));
  const validLatest = latestReportRows.filter((r) => validIds.has(String(r.destinationId)));
  const reachable = validLatest.filter((r) => r.reachable).length;
  const unreachable = validLatest.length - reachable;

  // 24h window: uptime % and average RTT from all reports in the last 24 hours.
  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const recent = await prisma.traceReport.findMany({
    where: { startedAt: { gte: since24h } },
    select: { reachable: true, pingAvgRtt: true, startedAt: true },
  });
  const samples24 = recent.length;
  const reachable24 = recent.filter((r) => r.reachable).length;
  const rtts = recent
    .map((r) => r.pingAvgRtt)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const avgRtt24 = rtts.length ? Math.round((rtts.reduce((a, b) => a + b, 0) / rtts.length) * 10) / 10 : null;

  const lastRun = await prisma.traceReport.findFirst({
    where: { triggeredBy: 'scheduler' },
    orderBy: { startedAt: 'desc' },
    select: { startedAt: true },
  });

  // Ping-based network health: average latency of the most recent sample per destination.
  const latestPingRows = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT ON (destination_id) destination_id AS "destinationId", success,
            avg_rtt AS "avgRtt"
       FROM ping_samples
   ORDER BY destination_id, sampled_at DESC`
  ) as unknown as Array<Record<string, unknown>>;
  const pingAvgs = latestPingRows
    .map((p) => p.avgRtt)
    .filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
  const networkLatencyMs = pingAvgs.length
    ? Math.round((pingAvgs.reduce((a, b) => a + b, 0) / pingAvgs.length) * 10) / 10
    : null;
  const pingReachable = latestPingRows.filter((p) => p.success).length;
  const pingUnreachable = latestPingRows.length - pingReachable;

  res.json({
    destinations: destCount,
    enabledDestinations: enabledCount,
    reports: reportCount,
    changes: changeCount,
    criticalChanges: criticalCount,
    unacknowledgedChanges: unackedCount,
    lastScheduledRunAt: lastRun?.startedAt ?? null,
    recovery: {
      reachable,
      unreachable,
    },
    networkLatencyMs,
    pingRecovery: {
      reachable: pingReachable,
      unreachable: pingUnreachable,
    },
    uptime24h: samples24 ? Math.round((reachable24 / samples24) * 1000) / 10 : null,
    avgRtt24h: avgRtt24,
    tracingRunning: isTracingRunning(),
  });
});

/** Hourly-bucketed trend of overall reachability and latency. */
router.get('/trend', async (req, res) => {
  const hours = Math.min(720, Math.max(1, Number(req.query.hours) || 24));
  const from = new Date(Date.now() - hours * 3600 * 1000);
  const reports = await prisma.traceReport.findMany({
    where: { startedAt: { gte: from } },
    select: { startedAt: true, reachable: true, pingAvgRtt: true },
  });

  const buckets = new Map<number, { samples: number; reachable: number; rttSum: number; rttCount: number }>();
  for (const r of reports) {
    const h = Math.floor(r.startedAt.getTime() / 3600000) * 3600000;
    let b = buckets.get(h);
    if (!b) {
      b = { samples: 0, reachable: 0, rttSum: 0, rttCount: 0 };
      buckets.set(h, b);
    }
    b.samples += 1;
    if (r.reachable) b.reachable += 1;
    const avg = r.pingAvgRtt ?? null;
    if (avg !== null && Number.isFinite(avg)) {
      b.rttSum += avg;
      b.rttCount += 1;
    }
  }

  const points = Array.from(buckets.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([h, b]) => ({
      at: new Date(h).toISOString(),
      samples: b.samples,
      uptimePct: b.samples ? Math.round((b.reachable / b.samples) * 1000) / 10 : 0,
      avgRtt: b.rttCount ? Math.round((b.rttSum / b.rttCount) * 10) / 10 : null,
    }));

  res.json(points);
});

export default router;
