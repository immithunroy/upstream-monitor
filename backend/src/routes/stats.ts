import { Router } from 'express';
import { Destination } from '../models/Destination';
import { ChangeEvent } from '../models/ChangeEvent';
import { TraceReport } from '../models/TraceReport';
import { isTracingRunning } from '../services/orchestrator';

const router = Router();

router.get('/', async (_req, res) => {
  const [destCount, enabledCount, reportCount, changeCount, criticalCount, unackedCount, latestReports] =
    await Promise.all([
      Destination.countDocuments(),
      Destination.countDocuments({ enabled: true }),
      TraceReport.countDocuments(),
      ChangeEvent.countDocuments(),
      ChangeEvent.countDocuments({ severity: 'critical' }),
      ChangeEvent.countDocuments({ acknowledged: false }),
      TraceReport.aggregate([
        { $sort: { startedAt: -1 } },
        { $group: { _id: '$destinationId', doc: { $first: '$$ROOT' } } },
        { $replaceRoot: { newRoot: '$doc' } },
      ]).sort({ startedAt: -1 }),
    ]);

  const reachable = latestReports.filter((r) => r.reachable).length;
  const unreachable = latestReports.filter((r) => !r.reachable).length;

  // 24h window: uptime % and average RTT from all reports in the last 24 hours.
  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const recent = await TraceReport.find({ startedAt: { $gte: since24h } })
    .select('reachable ping.avgRtt startedAt')
    .lean();
  const samples24 = recent.length;
  const reachable24 = recent.filter((r) => r.reachable).length;
  const rtts = recent
    .map((r) => r.ping.avgRtt)
    .filter((v): v is number => v !== null && Number.isFinite(v));
  const avgRtt24 = rtts.length ? Math.round((rtts.reduce((a, b) => a + b, 0) / rtts.length) * 10) / 10 : null;

  const lastRun = await TraceReport.findOne({ triggeredBy: 'scheduler' })
    .sort({ startedAt: -1 })
    .lean();

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
    uptime24h: samples24 ? Math.round((reachable24 / samples24) * 1000) / 10 : null,
    avgRtt24h: avgRtt24,
    tracingRunning: isTracingRunning(),
  });
});

/** Hourly-bucketed trend of overall reachability and latency. */
router.get('/trend', async (req, res) => {
  const hours = Math.min(720, Math.max(1, Number(req.query.hours) || 24));
  const from = new Date(Date.now() - hours * 3600 * 1000);
  const reports = await TraceReport.find({ startedAt: { $gte: from } })
    .select('startedAt reachable ping.avgRtt')
    .lean();

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
    const avg = r.ping?.avgRtt ?? null;
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
