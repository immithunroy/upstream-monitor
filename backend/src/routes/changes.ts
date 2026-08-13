import { Router } from 'express';
import prisma from '../config/prisma';
import { requireAdmin } from '../middleware/auth';
import { changeToApi } from '../lib/mappers';

const router = Router();

router.get('/', async (req, res) => {
  const { destinationId, severity, page = '1', limit = '50', acknowledged } = req.query;
  const where: Record<string, unknown> = {};
  if (destinationId) where.destinationId = destinationId;
  if (severity) where.severity = severity;
  if (acknowledged === 'true' || acknowledged === 'false') {
    where.acknowledged = acknowledged === 'true';
  }

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(200, Math.max(1, Number(limit) || 50));

  const [total, docs] = await Promise.all([
    prisma.changeEvent.count({ where }),
    prisma.changeEvent.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (pageNum - 1) * limitNum,
      take: limitNum,
      include: { changes: true },
    }),
  ]);

  res.json({ total, page: pageNum, limit: limitNum, data: docs.map(changeToApi) });
});

router.post('/acknowledge-all', requireAdmin, async (req, res) => {
  const { destinationId } = req.body || {};
  const where: Record<string, unknown> = { acknowledged: false };
  if (destinationId) where.destinationId = destinationId;
  const result = await prisma.changeEvent.updateMany({ where, data: { acknowledged: true } });
  res.json({ acknowledged: result.count });
});

router.post('/:id/acknowledge', requireAdmin, async (req, res) => {
  const event = await prisma.changeEvent.update({
    where: { id: req.params.id },
    data: { acknowledged: true },
    include: { changes: true },
  });
  res.json(changeToApi(event));
});

export default router;
