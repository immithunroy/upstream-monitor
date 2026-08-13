import { Router } from 'express';
import prisma from '../config/prisma';
import { requireAdmin } from '../middleware/auth';
import { enrichAllDestinations, enrichDestinationHost } from '../services/enrich';
import { destToApi } from '../lib/mappers';

const router = Router();

router.get('/', async (_req, res) => {
  const dests = await prisma.destination.findMany({ orderBy: { name: 'asc' } });
  res.json(dests.map(destToApi));
});

router.get('/:id', async (req, res) => {
  const dest = await prisma.destination.findUnique({ where: { id: req.params.id } });
  if (!dest) {
    res.status(404).json({ error: 'Destination not found' });
    return;
  }
  res.json(destToApi(dest));
});

router.post('/enrich', requireAdmin, async (_req, res) => {
  const result = await enrichAllDestinations();
  res.json(result);
});

router.post('/', requireAdmin, async (req, res) => {
  try {
    const { name, host, category, location, region, description, enabled } = req.body;
    if (!name || !host) {
      res.status(400).json({ error: 'name and host are required' });
      return;
    }
    const dest = await prisma.destination.create({
      data: {
        name,
        host,
        category: category || 'service',
        location: location || '',
        region: region || '',
        description: description || '',
        enabled: enabled ?? true,
        createdBy: 'api',
      },
    });
    // Fire-and-forget RIR attribution for the new host.
    void enrichDestinationHost(host).then((data) =>
      prisma.destination.update({ where: { id: dest.id }, data: { ...data, enrichedAt: new Date() } })
    );
    res.status(201).json(destToApi(dest));
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: 'A destination with this host already exists' });
      return;
    }
    res.status(500).json({ error: (err as Error).message });
  }
});

router.put('/:id', requireAdmin, async (req, res) => {
  try {
    const allowed = ['name', 'host', 'category', 'location', 'region', 'description', 'enabled'];
    const patch: Record<string, unknown> = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) patch[key] = req.body[key];
    }
    const existing = await prisma.destination.findUnique({ where: { id: req.params.id } });
    if (!existing) {
      res.status(404).json({ error: 'Destination not found' });
      return;
    }
    const dest = await prisma.destination.update({
      where: { id: req.params.id },
      data: patch,
    });
    // Re-attribute when the host changed.
    if (patch.host !== undefined && patch.host !== existing.host) {
      void enrichDestinationHost(dest.host).then((data) =>
        prisma.destination.update({ where: { id: dest.id }, data: { ...data, enrichedAt: new Date() } })
      );
    }
    res.json(destToApi(dest));
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  // FK ON DELETE CASCADE removes related reports, changes and ping samples.
  const dest = await prisma.destination.findUnique({ where: { id: req.params.id } });
  if (!dest) {
    res.status(404).json({ error: 'Destination not found' });
    return;
  }
  await prisma.destination.delete({ where: { id: req.params.id } });
  res.json({ ok: true });
});

/** Deletes every report, change event and ping sample for a destination
 *  without removing the destination itself. */
router.delete('/:id/data', requireAdmin, async (req, res) => {
  const dest = await prisma.destination.findUnique({ where: { id: req.params.id } });
  if (!dest) {
    res.status(404).json({ error: 'Destination not found' });
    return;
  }
  const id = req.params.id;
  const [reports, changes, pings] = await Promise.all([
    prisma.traceReport.deleteMany({ where: { destinationId: id } }),
    prisma.changeEvent.deleteMany({ where: { destinationId: id } }),
    prisma.pingSample.deleteMany({ where: { destinationId: id } }),
  ]);
  res.json({
    ok: true,
    deleted: {
      reports: reports.count,
      changes: changes.count,
      pings: pings.count,
    },
  });
});

export default router;
