import { Router } from 'express';
import { Destination } from '../models/Destination';
import { ChangeEvent } from '../models/ChangeEvent';
import { TraceReport } from '../models/TraceReport';

const router = Router();

router.get('/', async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  if (q.length < 2) {
    res.json({ query: q, destinations: [], changes: [], reports: [] });
    return;
  }

  const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(esc, 'i');

  const [dests, changes, reports] = await Promise.all([
    Destination.find({ enabled: true }).select('_id name host asn company category location region').lean(),
    ChangeEvent.find({
      $or: [{ destHost: regex }, { destName: regex }, { summary: regex }, { 'changes.message': regex }],
    })
      .sort({ createdAt: -1 })
      .limit(8)
      .lean(),
    TraceReport.find({ $or: [{ destHost: regex }, { destName: regex }] })
      .sort({ startedAt: -1 })
      .limit(8)
      .lean(),
  ]);

  const asnMatch = /^as(\d+)$/i.test(q) ? Number.parseInt(q.slice(2), 10) : null;
  const hostMatch = new RegExp(esc.replace(/\./g, '\\.'), 'i');

  const destResults = dests
    .filter((d) => {
      if (asnMatch !== null && d.asn === asnMatch) return true;
      return (
        d.name.toLowerCase().includes(q) ||
        d.host.toLowerCase().includes(q) ||
        String(d.company ?? '').toLowerCase().includes(q) ||
        hostMatch.test(d.host)
      );
    })
    .slice(0, 8)
    .map((d) => ({
      type: 'destination' as const,
      id: String(d._id),
      title: d.name,
      subtitle: [d.host, d.asn ? `AS${d.asn}` : null, d.company].filter(Boolean).join(' · '),
      path: `/destination/${String(d._id)}`,
    }));

  const changeResults = changes.map((c) => ({
    type: 'change' as const,
    id: String(c._id),
    title: `${c.destName || c.destHost} — ${c.summary}`,
    subtitle: `${c.severity} · ${c.changes.length} change(s)`,
    path: `/changes?destination=${String(c.destinationId)}`,
  }));

  const seen = new Set<string>();
  const reportResults = reports
    .filter((r) => {
      const key = String(r.destinationId);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => ({
      type: 'report' as const,
      id: String(r._id),
      title: r.destName || r.destHost,
      subtitle: `${r.reachable ? 'reachable' : 'unreachable'} · latest report`,
      path: `/reports?destination=${String(r.destinationId)}`,
    }));

  res.json({ query: q, destinations: destResults, changes: changeResults, reports: reportResults });
});

export default router;
