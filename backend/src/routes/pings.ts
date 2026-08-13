import { Router } from 'express';
import prisma from '../config/prisma';
import { pingToApi } from '../lib/mappers';

const router = Router();

router.get('/:destinationId', async (req, res) => {
  const { destinationId } = req.params;
  const { limit = '500' } = req.query;
  const limitNum = Math.min(2000, Math.max(1, Number(limit) || 500));
  const samples = await prisma.pingSample.findMany({
    where: { destinationId },
    orderBy: { sampledAt: 'asc' },
    take: limitNum,
  });
  res.json(samples.map(pingToApi));
});

export default router;
