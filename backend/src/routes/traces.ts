import { Router } from 'express';
import { requireAdmin } from '../middleware/auth';
import prisma from '../config/prisma';
import { isTracingRunning, traceAll, traceDestination } from '../services/orchestrator';

const router = Router();

router.post('/run', requireAdmin, async (req, res) => {
  const { destinationId } = req.body || {};

  if (destinationId) {
    const dest = await prisma.destination.findUnique({ where: { id: destinationId } });
    if (!dest) {
      res.status(404).json({ error: 'Destination not found' });
      return;
    }
    const result = await traceDestination(dest as never, 'manual');
    res.json({
      reportId: result.report.id,
      reachable: result.report.reachable,
      hopCount: result.report.hops.length,
      changeEventId: result.changeEvent?.id ?? null,
      changeCount: result.changeEvent?.changes.length ?? 0,
    });
    return;
  }

  if (isTracingRunning()) {
    res.status(409).json({ error: 'A trace run is already in progress' });
    return;
  }

  const results = await traceAll('manual');
  res.json({
    traced: results.length,
    reachable: results.filter((r) => r.report.reachable).length,
    unreachable: results.filter((r) => !r.report.reachable).length,
    changesDetected: results.filter((r) => r.changeEvent).length,
  });
});

router.get('/status', async (_req, res) => {
  res.json({ running: isTracingRunning() });
});

export default router;
