import { Router } from 'express';
import { Destination } from '../models/Destination';
import { TraceReport } from '../models/TraceReport';
import { ChangeEvent } from '../models/ChangeEvent';
import { PingSample } from '../models/PingSample';
import { requireAdmin } from '../middleware/auth';
import { enrichAllDestinations, enrichDestinationHost } from '../services/enrich';

const router = Router();

router.get('/', async (_req, res) => {
  const dests = await Destination.find({}).sort({ name: 1 }).lean();
  res.json(dests);
});

router.get('/:id', async (req, res) => {
  const dest = await Destination.findById(req.params.id).lean();
  if (!dest) {
    res.status(404).json({ error: 'Destination not found' });
    return;
  }
  res.json(dest);
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
    const dest = await Destination.create({
      name,
      host,
      category: category || 'service',
      location: location || '',
      region: region || '',
      description: description || '',
      enabled: enabled ?? true,
      createdBy: 'api',
    });
    // Fire-and-forget RIR attribution for the new host.
    void enrichDestinationHost(host).then((data) =>
      Destination.updateOne(
        { _id: dest._id },
        { $set: { ...data, enrichedAt: new Date() } }
      )
    );
    res.status(201).json(dest);
  } catch (err) {
    if ((err as { code?: number }).code === 11000) {
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
    const existing = await Destination.findById(req.params.id).lean();
    if (!existing) {
      res.status(404).json({ error: 'Destination not found' });
      return;
    }
    const dest = await Destination.findByIdAndUpdate(req.params.id, patch, { new: true, runValidators: true });
    if (!dest) {
      res.status(404).json({ error: 'Destination not found' });
      return;
    }
    // Re-attribute when the host changed.
    if (patch.host !== undefined && patch.host !== existing.host) {
      void enrichDestinationHost(dest.host).then((data) =>
        Destination.updateOne(
          { _id: dest._id },
          { $set: { ...data, enrichedAt: new Date() } }
        )
      );
    }
    res.json(dest);
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  const dest = await Destination.findByIdAndDelete(req.params.id);
  if (!dest) {
    res.status(404).json({ error: 'Destination not found' });
    return;
  }
  const id = dest._id as unknown as string;
  // Cascade-delete all related data so we never leave orphaned reports behind.
  await Promise.all([
    TraceReport.deleteMany({ destinationId: id }),
    ChangeEvent.deleteMany({ destinationId: id }),
    PingSample.deleteMany({ destinationId: id }),
  ]);
  res.json({ ok: true });
});

/** Deletes every report, change event and ping sample for a destination
 *  without removing the destination itself. */
router.delete('/:id/data', requireAdmin, async (req, res) => {
  const dest = await Destination.findById(req.params.id).lean();
  if (!dest) {
    res.status(404).json({ error: 'Destination not found' });
    return;
  }
  const id = dest._id as unknown as string;
  const [reports, changes, pings] = await Promise.all([
    TraceReport.deleteMany({ destinationId: id }),
    ChangeEvent.deleteMany({ destinationId: id }),
    PingSample.deleteMany({ destinationId: id }),
  ]);
  res.json({
    ok: true,
    deleted: {
      reports: reports.deletedCount,
      changes: changes.deletedCount,
      pings: pings.deletedCount,
    },
  });
});

export default router;
