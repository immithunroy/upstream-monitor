import { Router } from 'express';
import { ChangeEvent } from '../models/ChangeEvent';
import { Destination } from '../models/Destination';
import { TraceReport, type TraceHop } from '../models/TraceReport';
import { buildHopDiff } from '../services/comparator';
import { ensureReportHopsEnriched } from '../services/enrich';

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
  const filter: Record<string, unknown> = {};
  if (destinationId) filter.destinationId = destinationId;
  if (from || to) {
    filter.startedAt = {};
    if (from) (filter.startedAt as Record<string, unknown>).$gte = new Date(from as string);
    if (to) (filter.startedAt as Record<string, unknown>).$lte = new Date(to as string);
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));

  const [total, docs] = await Promise.all([
    TraceReport.countDocuments(filter),
    TraceReport.find(filter)
      .sort({ startedAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum)
      .lean(),
  ]);

  res.json({ total, page: pageNum, limit: limitNum, data: docs });
});

router.get('/latest', async (_req, res) => {
  const [destIds, docs] = await Promise.all([
    Destination.find({}).select('_id').lean(),
    TraceReport.aggregate([
      { $sort: { startedAt: -1 } },
      { $group: { _id: '$destinationId', doc: { $first: '$$ROOT' } } },
      { $replaceRoot: { newRoot: '$doc' } },
    ]).sort({ startedAt: -1 }),
  ]);
  const validIds = new Set(destIds.map((d) => String(d._id)));
  res.json(docs.filter((r) => validIds.has(String(r.destinationId))));
});

/** Period availability / latency summary (daily, weekly, monthly, quarterly,
 *  half-yearly, yearly) computed from trace reports in the window. */
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

  const filter: Record<string, unknown> = { startedAt: { $gte: from, $lte: to } };
  if (destinationId) filter.destinationId = destinationId;

  const [dests, reports, changeTotal] = await Promise.all([
    Destination.find({}).select('_id name host asn company category').lean(),
    TraceReport.find(filter).select('destinationId destHost destName startedAt reachable ping.avgRtt asn company').lean(),
    ChangeEvent.countDocuments({ createdAt: { $gte: from, $lte: to } }),
  ]);

  const destById = new Map(dests.map((d) => [String(d._id), d]));
  const perDest = new Map<string, { reports: number; reachable: number; rttSum: number; rttCount: number }>();
  const series = new Map<string, { samples: number; reachable: number; rttSum: number; rttCount: number }>();
  let totalReports = 0;
  let totalReachable = 0;
  let rttSum = 0;
  let rttCount = 0;

  for (const r of reports) {
    const key = String(r.destinationId);
    totalReports += 1;
    if (r.reachable) totalReachable += 1;

    const avg = r.ping.avgRtt ?? null;
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

    const day = new Date(r.startedAt).toISOString().slice(0, 10);
    let s = series.get(day);
    if (!s) {
      s = { samples: 0, reachable: 0, rttSum: 0, rttCount: 0 };
      series.set(day, s);
    }
    s.samples += 1;
    if (r.reachable) s.reachable += 1;
    if (avg !== null && Number.isFinite(avg)) {
      s.rttSum += avg;
      s.rttCount += 1;
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
        uptimePct: s.samples ? Math.round((s.reachable / s.samples) * 1000) / 10 : 0,
        avgRtt: s.rttCount ? Math.round((s.rttSum / s.rttCount) * 10) / 10 : null,
      })),
  });
});

router.get('/:id', async (req, res) => {
  const report = await TraceReport.findById(req.params.id).lean();
  if (!report) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }
  // Lazy-attribute hop IPs (ASN / company) for reports stored before this feature.
  const hops = await ensureReportHopsEnriched({
    _id: report._id,
    hops: report.hops as unknown as TraceHop[],
  });
  res.json({ ...report, hops });
});

/**
 * Hop-by-hop comparison of a report against the previous report for the same
 * destination: every TTL with its old/new IP, RTT, ASN and company, plus a
 * change marker (`same`, `hop_added`, `hop_removed`, `hop_ip_change`,
 * `hop_rtt`). Also returns the previous report for cross-linking.
 */
router.get('/:id/compare', async (req, res) => {
  const current = await TraceReport.findById(req.params.id).lean();
  if (!current) {
    res.status(404).json({ error: 'Report not found' });
    return;
  }

  const prev = await TraceReport.findOne({
    destinationId: current.destinationId,
    _id: { $ne: current._id },
  })
    .sort({ startedAt: -1 })
    .lean();

  const [currentHops, prevHops] = await Promise.all([
    ensureReportHopsEnriched({ _id: current._id, hops: current.hops as unknown as TraceHop[] }),
    prev
      ? ensureReportHopsEnriched({ _id: prev._id, hops: prev.hops as unknown as TraceHop[] })
      : Promise.resolve([] as TraceHop[]),
  ]);

  const currentWithHops = { ...current, hops: currentHops };
  const prevWithHops = prev ? { ...prev, hops: prevHops } : null;

  const diff = prevWithHops
    ? buildHopDiff(
        { hops: prevWithHops.hops as unknown as TraceHop[] },
        { hops: currentWithHops.hops as unknown as TraceHop[] }
      )
    : [];

  res.json({
    current: currentWithHops,
    previous: prevWithHops,
    diff,
    hasPrevious: !!prevWithHops,
  });
});

export default router;
