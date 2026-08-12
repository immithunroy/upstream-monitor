import { Router } from 'express';
import { PingSample } from '../models/PingSample';

const router = Router();

router.get('/:destinationId', async (req, res) => {
  const { destinationId } = req.params;
  const { limit = '500' } = req.query;
  const limitNum = Math.min(2000, Math.max(1, Number(limit) || 500));
  const samples = await PingSample.find({ destinationId })
    .sort({ sampledAt: -1 })
    .limit(limitNum)
    .lean();
  res.json(samples.reverse());
});

export default router;
