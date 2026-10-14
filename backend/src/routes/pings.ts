import { Router } from 'express';
import prisma from '../config/prisma';
import { pingToApi } from '../lib/mappers';

const router = Router();

router.get('/:destinationId', async (req, res) => {
  const { destinationId } = req.params;
  const { limit = '500' } = req.query;
  const limitNum = Math.min(2000, Math.max(1, Number(limit) || 500));
  // Newest N samples (ascending for the graph). Ordering asc + take returned the
  // OLDEST samples, so graphs stopped moving once a destination had > limit samples.
  const samples = await prisma.pingSample.findMany({
    where: { destinationId },
    orderBy: { sampledAt: 'desc' },
    take: limitNum,
  });
  res.json(samples.reverse().map(pingToApi));
});

export default router;
