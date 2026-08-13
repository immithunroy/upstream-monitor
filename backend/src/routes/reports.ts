import { Router } from 'express';
import prisma from '../config/prisma';
import { buildHopDiff } from '../services/comparator';
import { ensureReportHopsEnriched } from '../services/enrich';
import { hopToApp, rawRowToReport, reportToApi } from '../lib/mappers';

const router = Router();

const PERIOD_DAYS: Record<string, number> = {
  daily: 1,
  weekly: 7,
  monthly: 30,
  quarterly: 90,
  'half-yearly': 182,
  yearly: 365,
};

function validPeriod(p: string): boolean {
  return Object.prototype.hasOwnProperty.call(PERIOD_DAYS, p);
}

router.get('/', async (req, res) => {
  const { destinationId, page = '1', limit = '50', from, to } = req.query;
  const where: Record<string, unknown> = {};
  if (destinationId) where.destinationId = destinationId;
  if (from || to) {
    where.startedAt = {};
    if (from) (where.startedAt as Record<string, unknown>).gte = new Date(from as string);
    if (to) (where.startedAt as Record<string, unknown>).lte = new Date(to as string);
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));

  const [total, docs] = await Promise.all([
    prisma.traceReport.count({ where }),
    prisma.traceReport.findMany({
      where,
      orderBy: { startedAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      include: { hops: { orderBy: { ttl: 'asc' } } },
    }),
  ]);

  res.json({ total, page: pageNum, limit: limitNum, data: docs.map(reportToApi) });
});

/** Latest trace report per destination (DISTINCT ON destination_id). */
router.get('/latest', async (_req, res) => {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT DISTINCT ON (destination_id)
            id, destination_id AS "destinationId", dest_host AS "destHost", dest_name AS "destName",
            asn, company, triggered_by AS "triggeredBy", started_at AS "startedAt",
            completed_at AS "completedAt", duration_ms AS "durationMs", reachable,
            ping_success AS "pingSuccess", ping_packets_sent AS "pingPacketsSent",
            ping_packets_received AS "pingPacketsReceived", ping_loss_percent AS "pingLossPercent",
            ping_min_rtt AS "pingMinRtt", ping_max_rtt AS "pingMaxRtt", ping_avg_rtt AS "pingAvgRtt",
            path_fingerprint AS "pathFingerprint", error, created_at AS "createdAt", updated_at AS "updatedAt"
       FROM trace_reports
   ORDER BY destination_id, started_at DESC`
  ) as unknown as Array<Record<string, unknown>>;

  const dests = await prisma.destination.findMany({ select: { id: true } });
  const validIds = new Set(dests.map((d) => d.id));
  const docs = rows
    .filter((r) => validIds.has(String(r.destinationId)))
    .map((r) => reportToApi(rawRowToReport(r)));

  // Attach hops for each latest report.
  const ids = docs.map((d) => d._id);
  if (ids.length > 0) {
    const hops = await prisma.traceHop.findMany({ where: { reportId: { in: ids } }, orderBy: { ttl: 'asc' } });
    const byReport = new Map<string, typeof hops>();
    for (const h of hops) {
      const list = byReport.get(h.reportId) ?? [];
      list.push(h);
      byReport.set(h.reportId, list);
    }
    for (const d of docs) d.hops = byReport.get(d._id) ?? [];
  }

  res.json(docs);
});

/** Period availability / latency summary (daily, weekly, monthly, quarterly,
 *  half-yearly, yearly). The per-destination table + overall stats come from
 *  trace reports; the graph series is bucketed from high-frequency ping
 *  samples (daily = hourly timeline, weekly/monthly = daily, longer = monthly). */
router.get('/period', async (req, res) => {
  const { period = 'daily', destinationId } = req.query;
  const p = String(period);
  if (!validPeriod(p)) {
    res.status(400).json({ error: 'invalid period, use one of: daily, weekly, monthly, quarterly, half-yearly, yearly' });
    return;
  }

  const days = PERIOD_DAYS[p];
  const to = new Date();
  const from = new Date(Date.now() - days * 24 * 3600 * 1000);

  const where: Record<string, unknown> = { startedAt: { gte: from, lte: to } };
  if (destinationId) where.destinationId = destinationId;

  const [dests, reports, changeTotal] = await Promise.all([
    prisma.destination.findMany({ select: { id: true, name: true, host: true, asn: true, company: true, category: true } }),
    prisma.traceReport.findMany({
      where,
      select: {
        destinationId: true,
        destHost: true,
        destName: true,
        startedAt: true,
        reachable: true,
        pingAvgRtt: true,
        asn: true,
        company: true,
      },
    }),
    prisma.changeEvent.count({ where: { createdAt: { gte: from, lte: to } } }),
  ]);

  const destById = new Map(dests.map((d) => [d.id, d]));
  const perDest = new Map<string, { reports: number; reachable: number; rttSum: number; rttCount: number }>();
  let totalReports = 0;
  let totalReachable = 0;
  let rttSum = 0;
  let rttCount = 0;

  for (const r of reports) {
    const key = r.destinationId;
    totalReports += 1;
    if (r.reachable) totalReachable += 1;

    const avg = r.pingAvgRtt ?? null;
    if (avg !== null && Number.isFinite(avg)) {
      rttSum += avg;
      rttCount += 1;
    }

    let bucket = perDest.get(key);
    if (!bucket) {
      bucket = { reports: 0, reachable: 0, rttSum: 0, rttCount: 0 };
      perDest.set(key, bucket);
    }
    bucket.reports += 1;
    if (r.reachable) bucket.reachable += 1;
    if (avg !== null && Number.isFinite(avg)) {
      bucket.rttSum += avg;
      bucket.rttCount += 1;
    }
  }

  const destinations = Array.from(perDest.entries()).map(([id, b]) => {
    const d = destById.get(id);
    return {
      destinationId: id,
      name: d?.name ?? 'Unknown',
      host: d?.host ?? '',
      asn: d?.asn ?? null,
      company: d?.company ?? '',
      category: d?.category ?? 'service',
      reports: b.reports,
      uptimePct: b.reports ? Math.round((b.reachable / b.reports) * 1000) / 10 : 0,
      avgRtt: b.rttCount ? Math.round((b.rttSum / b.rttCount) * 10) / 10 : null,
    };
  }).sort((a, b) => b.uptimePct - a.uptimePct || (b.avgRtt ?? 0) - (a.avgRtt ?? 0));

  // --- Graph series, bucketed from ping samples per period ---
  const pingWhere: Record<string, unknown> = { sampledAt: { gte: from, lte: to } };
  if (destinationId) pingWhere.destinationId = destinationId;
  const samples = await prisma.pingSample.findMany({
    where: pingWhere,
    select: { sampledAt: true, success: true, avgRtt: true },
  });

  const bucketKey = (dt: Date): string => {
    switch (p) {
      case 'daily': {
        const h = new Date(dt);
        h.setMinutes(0, 0, 0);
        return h.toISOString();
      }
      case 'weekly':
      case 'monthly': {
        const d = new Date(dt);
        d.setHours(0, 0, 0, 0);
        return d.toISOString();
      }
      default: {
        const m = new Date(dt);
        m.setDate(1);
        m.setHours(0, 0, 0, 0);
        return m.toISOString();
      }
    }
  };

  const series = new Map<string, { samples: number; success: number; rttSum: number; rttCount: number }>();
  for (const s of samples) {
    const key = bucketKey(s.sampledAt);
    let b = series.get(key);
    if (!b) {
      b = { samples: 0, success: 0, rttSum: 0, rttCount: 0 };
      series.set(key, b);
    }
    b.samples += 1;
    if (s.success) b.success += 1;
    const avg = s.avgRtt;
    if (avg !== null && Number.isFinite(avg)) {
      b.rttSum += avg;
      b.rttCount += 1;
    }
  }

  res.json({
    period: p,
    from,
    to,
    overall: {
      reports: totalReports,
      reachable: totalReachable,
      uptimePct: totalReports ? Math.round((totalReachable / totalReports) * 1000) / 10 : 0,
      avgRtt: rttCount ? Math.round((rttSum / rttCount) * 10) / 10 : null,
      changes: changeTotal,
    },
    destinations,
    series: Array.from(series.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([day, s]) => ({
        day,
        samples: s.samples,
        uptimePct: s.samples ? Math.round((s.success / s.samples) * 1000) / 10 : 0,
        avgRtt: s.rttCount ? Math.round((s.rttSum / s.rttCount) * 10) / 10 : null,
      })),
  });
});

router.get('/:id', async (req, res) => {
  const report = await prisma.traceReport.findUnique({
    where: { id: req.params.id },
    include: { hops: { orderBy: { ttl: 'asc' } } },
  });
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  // Lazy-attribute hop IPs (ASN / company) for reports stored before this feature.
  const appHops = report.hops.map(hopToApp);
  const hops = await ensureReportHopsEnriched({ id: report.id, hops: appHops });
  res.json({ ...reportToApi({ ...report, hops: report.hops }), hops });
});

/**
 * Hop-by-hop comparison of a report against the previous report for the same
 * destination: every TTL with its old/new IP, RTT, ASN and company, plus a
 * change marker (`same`, `hop_added`, `hop_removed`, `hop_ip_change`,
 * `hop_as_change`, `hop_rtt`). Also returns the previous report.
 */
router.get('/:id/compare', async (req, res) => {
  const current = await prisma.traceReport.findUnique({
    where: { id: req.params.id },
    include: { hops: { orderBy: { ttl: 'asc' } } },
  });
  if (!current) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }

  const prev = await prisma.traceReport.findFirst({
    where: { destinationId: current.destinationId, id: { not: current.id } },
    orderBy: { startedAt: 'desc' },
    include: { hops: { orderBy: { ttl: 'asc' } } },
  });

  const [currentHops, prevHops] = await Promise.all([
    ensureReportHopsEnriched({ id: current.id, hops: current.hops.map(hopToApp) }),
    prev
      ? ensureReportHopsEnriched({ id: prev.id, hops: prev.hops.map(hopToApp) })
      : Promise.resolve([] as ReturnType<typeof hopToApp>[]),
  ]);

  const currentWithHops = { ...current, hops: currentHops };
  const prevWithHops = prev ? { ...prev, hops: prevHops } : null;

  const diff = prevWithHops
    ? buildHopDiff(
        { hops: prevWithHops.hops as never },
        { hops: currentWithHops.hops as never }
      )
    : [];

  res.json({
    current: reportToApi({ ...current, hops: currentHops } as never),
    previous: prevWithHops ? reportToApi({ ...prev, hops: prevHops } as never) : null,
    diff,
    hasPrevious: !!prevWithHops,
  });
});

export default router;
