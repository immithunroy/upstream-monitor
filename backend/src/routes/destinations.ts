import { Router } from 'express';
import multer from 'multer';
import prisma from '../config/prisma';
import { requireAdmin } from '../middleware/auth';
import { enrichAllDestinations } from '../services/enrich';
import { enrichInBackground } from '../services/enrichInBackground';
import { cleanHost } from '../lib/hostValidation';
import { buildImportTemplate, importDestinations, parseImportBuffer } from '../services/importDestinations';
import { destToApi } from '../lib/mappers';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

/** Download an .xlsx template for bulk destination uploads. */
router.get('/import/template', (_req, res) => {
  const buf = buildImportTemplate();
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', 'attachment; filename="destinations-template.xlsx"');
  res.send(buf);
});

/** Bulk-upload destinations from an XLSX/CSV file (admin). */
router.post('/import', requireAdmin, upload.single('file'), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: 'No file uploaded (expected multipart field "file")' });
    return;
  }
  try {
    const rows = parseImportBuffer(req.file.buffer);
    const result = await importDestinations(rows);
    res.json(result);
  } catch (err) {
    res.status(400).json({ error: `Could not parse file: ${(err as Error).message}` });
  }
});

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
    const { name, category, location, region, description, enabled } = req.body || {};
    if (typeof name !== 'string' || !name.trim() || !req.body?.host) {
      res.status(400).json({ error: 'name and host are required' });
      return;
    }
    const host = cleanHost(req.body.host);
    if (!host) {
      res.status(400).json({ error: 'host must be an IP address or hostname' });
      return;
    }
    const dest = await prisma.destination.create({
      data: {
        name: name.trim(),
        host,
        category: category || 'service',
        location: location || '',
        region: region || '',
        description: description || '',
        enabled: typeof enabled === 'boolean' ? enabled : true,
        createdBy: 'api',
      },
    });
    // Fire-and-forget RIR attribution for the new host.
    enrichInBackground({ id: dest.id }, host);
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
      if (req.body?.[key] !== undefined) patch[key] = req.body[key];
    }
    if (patch.host !== undefined) {
      const host = cleanHost(patch.host);
      if (!host) {
        res.status(400).json({ error: 'host must be an IP address or hostname' });
        return;
      }
      patch.host = host;
    }
    if (patch.enabled !== undefined && typeof patch.enabled !== 'boolean') {
      res.status(400).json({ error: 'enabled must be true or false' });
      return;
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
      enrichInBackground({ id: dest.id }, dest.host);
    }
    res.json(destToApi(dest));
  } catch (err) {
    if ((err as { code?: string }).code === 'P2002') {
      res.status(409).json({ error: 'A destination with this host already exists' });
      return;
    }
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
