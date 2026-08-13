import { Router } from 'express';
import prisma from '../config/prisma';

const router = Router();

router.get('/', async (req, res) => {
  const q = String(req.query.q ?? '').trim().toLowerCase();
  if (q.length < 2) {
    res.json({ query: q, destinations: [], changes: [], reports: [] });
    return;
  }

  const [dests, changes, reports] = await Promise.all([
    prisma.destination.findMany({ where: { enabled: true } }),
    prisma.changeEvent.findMany({
      where: {
        OR: [
          { destHost: { contains: q, mode: 'insensitive' } },
          { destName: { contains: q, mode: 'insensitive' } },
          { summary: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: 8,
      include: { changes: true },
    }),
    prisma.traceReport.findMany({
      where: {
        OR: [
          { destHost: { contains: q, mode: 'insensitive' } },
          { destName: { contains: q, mode: 'insensitive' } },
        ],
      },
      orderBy: { startedAt: 'desc' },
      take: 8,
    }),
  ]);

  const asnMatch = /^as(\d+)$/i.test(q) ? Number.parseInt(q.slice(2), 10) : null;
  const hostMatch = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\./g, '\\.'), 'i');

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
      id: d.id,
      title: d.name,
      subtitle: [d.host, d.asn ? `AS${d.asn}` : null, d.company].filter(Boolean).join(' · '),
      path: `/destination/${d.id}`,
    }));

  const changeResults = changes.map((c) => ({
    type: 'change' as const,
    id: c.id,
    title: `${c.destName || c.destHost} — ${c.summary}`,
    subtitle: `${c.severity} · ${c.changes.length} change(s)`,
    path: `/changes?destination=${c.destinationId}`,
  }));

  const seen = new Set<string>();
  const reportResults = reports
    .filter((r) => {
      const key = r.destinationId;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .map((r) => ({
      type: 'report' as const,
      id: r.id,
      title: r.destName || r.destHost,
      subtitle: `${r.reachable ? 'reachable' : 'unreachable'} · latest report`,
      path: `/reports?destination=${r.destinationId}`,
    }));

  res.json({ query: q, destinations: destResults, changes: changeResults, reports: reportResults });
});

export default router;
